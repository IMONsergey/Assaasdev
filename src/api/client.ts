import { getMethodDefinition, unsupportedMethods } from './catalog';
import type { CompletionRule } from './catalog';
import { ApiError, classifyServerError } from './errors';
import type { ApiErrorKind, OperationOutcome } from './errors';
import type {
  ApiClient, ApiClientConfig, ApiFrame, ConnectionStatus, HttpOptions, HttpResponse,
  RequestOptions, StreamOptions, Unsubscribe, WebSocketLike,
} from './types';

const OPEN = 1;
const hasOwn = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const callSafely = (callback: (() => void) | undefined) => { try { callback?.(); } catch { /* Consumers must not break transport cleanup or other subscriptions. */ } };

interface SocketContext {
  socket: WebSocketLike;
  ready: Promise<void>;
  resolve: () => void;
  reject: (error: ApiError) => void;
  opened: boolean;
  ended: boolean;
  dedicated: boolean;
  pending: Set<string>;
  clear: () => void;
}
interface PendingRequest {
  id: string;
  type: string;
  active: boolean;
  sent: boolean;
  mutation: boolean;
  principal: 'account' | 'shared';
  one: boolean;
  context?: SocketContext;
  responseTypes: readonly string[];
  completion: CompletionRule;
  seen: Set<string>;
  onFrame: (frame: ApiFrame) => void;
  onError: (error: ApiError) => void;
  onComplete?: () => void;
  clear: () => void;
}

function budget(value: number | undefined, fallback: number): number {
  const result = value ?? fallback;
  if (!Number.isFinite(result) || result < 0) throw new ApiError('transport', 'Request timeout must be a finite non-negative number.', { outcome: 'not-sent' });
  return result;
}

function baseUrl(input: string | undefined): URL {
  const browserBase = typeof globalThis.location !== 'undefined' ? globalThis.location.origin : undefined;
  if (!input && !browserBase) throw new ApiError('transport', 'An API base URL is required outside the browser.', { outcome: 'not-sent' });
  let url: URL;
  try { url = new URL(input || browserBase!, browserBase); }
  catch (cause) { throw new ApiError('transport', 'Invalid API base URL.', { cause, outcome: 'not-sent' }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new ApiError('transport', 'API base URL must be an HTTP(S) origin or path without credentials, query or fragment.', { outcome: 'not-sent' });
  }
  url.pathname = `${url.pathname.replace(/\/$/, '')}/`;
  return url;
}

function retryAfter(headers: Headers, payload?: Record<string, unknown>): number | undefined {
  const seconds = payload?.retry_after_seconds;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) return seconds;
  const header = headers.get('Retry-After');
  if (!header) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(header.trim())) return Number(header);
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - Date.now()) / 1_000)) : undefined;
}

class BrowserApiClient implements ApiClient {
  private readonly config: ApiClientConfig;
  private readonly base: URL;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly factory: (url: string) => WebSocketLike;
  private readonly sockets = new Set<SocketContext>();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly frameListeners = new Set<(frame: ApiFrame) => void>();
  private readonly statusListeners = new Set<(status: ConnectionStatus) => void>();
  private main?: SocketContext;
  private status: ConnectionStatus = 'idle';
  private sequence = 0;

  constructor(config: ApiClientConfig) {
    this.config = config;
    this.base = baseUrl(config.apiBaseUrl);
    this.fetcher = config.fetch ?? ((...args) => globalThis.fetch(...args));
    this.factory = config.webSocketFactory ?? ((url) => new WebSocket(url));
  }

  url(path: string): string {
    let result: URL;
    try {
      // Leading slash denotes a website route, while retaining a configured proxy prefix.
      result = new URL(path.replace(/^\/(?!\/)/, ''), this.base);
    } catch (cause) {
      throw new ApiError('transport', 'Invalid API route URL.', { cause, outcome: 'not-sent' });
    }
    if (result.origin !== this.base.origin || !['http:', 'https:'].includes(result.protocol) || result.username || result.password) {
      throw new ApiError('transport', 'Credentialed API requests must use the configured API origin.', { outcome: 'not-sent' });
    }
    return result.toString();
  }

  private socketUrl(): string {
    const result = this.config.wsUrl ? new URL(this.config.wsUrl, this.base) : new URL(this.url('/ws'));
    if (result.protocol === 'https:') result.protocol = 'wss:';
    if (result.protocol === 'http:') result.protocol = 'ws:';
    if (!['ws:', 'wss:'].includes(result.protocol) || result.username || result.password) {
      throw new ApiError('transport', 'Invalid WebSocket URL.', { outcome: 'not-sent' });
    }
    return result.toString();
  }

  async http<T = unknown>(path: string, options: HttpOptions = {}): Promise<T> {
    return (await this.httpResponse<T>(path, options)).data;
  }

  async httpResponse<T = unknown>(path: string, options: HttpOptions = {}): Promise<HttpResponse<T>> {
    const response = await this.fetchResponse(path, options, false);
    let text: string;
    try { text = await response.text(); }
    catch (cause) {
      if (cause instanceof ApiError) throw cause;
      const mutation = this.isHttpMutation(path, options);
      throw new ApiError(mutation ? 'unknown' : 'transport', 'The response body could not be read.', {
        cause, status: response.status, method: options.method, outcome: 'unknown',
      });
    }
    if (!text.trim()) return { data: undefined as T, status: response.status, headers: response.headers };
    try { return { data: JSON.parse(text) as T, status: response.status, headers: response.headers }; }
    catch (cause) {
      const mutation = this.isHttpMutation(path, options);
      throw new ApiError(mutation ? 'unknown' : 'transport', 'The API returned an invalid JSON response.', {
        cause, status: response.status, method: options.method, outcome: 'unknown',
      });
    }
  }

  async raw(path: string, options: HttpOptions = {}): Promise<Response> {
    return this.fetchResponse(path, options, true);
  }

  private isHttpMutation(path: string, options: HttpOptions): boolean {
    if (options.mutation !== undefined) return options.mutation;
    const method = (options.method ?? (options.body === undefined ? 'GET' : 'POST')).toUpperCase();
    // The documented logout route is a GET with a destructive server-side effect.
    return !['GET', 'HEAD', 'OPTIONS'].includes(method) || new URL(this.url(path)).pathname.endsWith('/auth/logout');
  }

  private async fetchResponse(path: string, options: HttpOptions, streaming: boolean): Promise<Response> {
    const url = this.url(path);
    const method = (options.method ?? (options.body === undefined ? 'GET' : 'POST')).toUpperCase();
    const mutation = this.isHttpMutation(path, options);
    const timeout = budget(options.timeoutMs, this.config.timeoutMs ?? 30_000);
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let sent = false;
    let cleaned = false;
    let bodyAbort: (() => void) | undefined;
    const externalAbort = () => controller.abort(options.signal?.reason);
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', externalAbort);
      if (bodyAbort) controller.signal.removeEventListener('abort', bodyAbort);
    };
    const interrupted = (cause?: unknown) => new ApiError(
      sent && mutation ? 'unknown' : timedOut ? 'timeout' : 'transport',
      sent && mutation ? 'The operation outcome is not confirmed. Refresh its current state before trying again.' : timedOut ? 'The API request timed out.' : controller.signal.aborted ? 'The API request was aborted.' : 'The API could not be reached.',
      { method, cause, outcome: sent ? 'unknown' : 'not-sent' },
    );

    if (options.signal?.aborted) throw interrupted(options.signal.reason);
    options.signal?.addEventListener('abort', externalAbort, { once: true });
    if (timeout > 0) timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    const headers = new Headers(options.headers);
    let body: string | undefined;
    try {
      if (options.body !== undefined) {
        body = JSON.stringify(options.body);
        if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      }
      if (!headers.has('Accept')) headers.set('Accept', streaming ? '*/*' : 'application/json');
    } catch (cause) {
      cleanup();
      throw new ApiError('transport', 'The request body cannot be encoded as JSON.', { cause, method, outcome: 'not-sent' });
    }

    try {
      sent = true;
      const original = await this.fetcher(url, { method, headers, body, credentials: 'include', signal: controller.signal });
      if (!original.ok) {
        const text = await original.text();
        let payload: Record<string, unknown> | undefined;
        try { const parsed: unknown = JSON.parse(text); if (record(parsed)) payload = parsed; } catch { /* Preserve a useful status when a proxy returns text/HTML. */ }
        const message = typeof payload?.error === 'string' && payload.error ? payload.error : `API request failed with HTTP ${original.status}.`;
        throw new ApiError(classifyServerError(message, original.status), message, {
          status: original.status, method, retryAfterSeconds: retryAfter(original.headers, payload),
          outcome: mutation && original.status >= 500 ? 'unknown' : 'rejected',
        });
      }
      // A raw download's budget covers headers; the user's signal still aborts its body.
      if (streaming && timer) { clearTimeout(timer); timer = undefined; }
      if (!original.body) { cleanup(); return original; }
      const reader = original.body.getReader();
      let finished = false;
      const wrapped = new ReadableStream<Uint8Array>({
        start: (streamController) => {
          bodyAbort = () => {
            if (finished) return;
            finished = true;
            const error = interrupted(controller.signal.reason);
            streamController.error(error);
            void reader.cancel(error).catch(() => undefined);
            cleanup();
          };
          controller.signal.addEventListener('abort', bodyAbort, { once: true });
          if (controller.signal.aborted) bodyAbort();
        },
        pull: async (streamController) => {
          if (finished) return;
          try {
            const chunk = await reader.read();
            if (finished) return;
            if (chunk.done) { finished = true; streamController.close(); cleanup(); }
            else streamController.enqueue(chunk.value);
          } catch (cause) {
            if (finished) return;
            finished = true;
            streamController.error(interrupted(cause));
            cleanup();
          }
        },
        cancel: async (reason) => {
          if (finished) return;
          finished = true;
          try { await reader.cancel(reason); } finally { cleanup(); }
        },
      });
      const response = new Response(wrapped, { status: original.status, statusText: original.statusText, headers: original.headers });
      // Retain fetch metadata lost when wrapping a readable body, without consuming it.
      Object.defineProperties(response, {
        url: { value: original.url }, redirected: { value: original.redirected }, type: { value: original.type },
      });
      return response;
    } catch (cause) {
      cleanup();
      if (cause instanceof ApiError) throw cause;
      throw interrupted(cause);
    }
  }

  getConnectionStatus(): ConnectionStatus { return this.status; }

  subscribeConnection(listener: (status: ConnectionStatus) => void): Unsubscribe {
    this.statusListeners.add(listener);
    callSafely(() => listener(this.status));
    return () => { this.statusListeners.delete(listener); };
  }

  subscribe(listener: (frame: ApiFrame) => void): Unsubscribe {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  private setStatus(status: ConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    for (const listener of this.statusListeners) callSafely(() => listener(status));
  }

  private mainContext(): SocketContext {
    if (this.main && !this.main.ended) return this.main;
    this.setStatus('connecting');
    try { this.main = this.openSocket(false); return this.main; }
    catch (cause) { this.setStatus('error'); throw cause; }
  }

  async connect(): Promise<void> { await this.mainContext().ready; }

  disconnect(): void {
    for (const context of [...this.sockets]) this.endSocket(context, 'The API connection was closed.', 'closed');
    this.main = undefined;
    this.setStatus('closed');
  }

  private openSocket(dedicated: boolean): SocketContext {
    const timeout = budget(this.config.connectTimeoutMs, 10_000);
    let socket: WebSocketLike;
    try { socket = this.factory(this.socketUrl()); }
    catch (cause) { throw new ApiError('transport', 'The API connection could not be created.', { cause, outcome: 'not-sent' }); }
    let resolve!: () => void;
    let reject!: (error: ApiError) => void;
    const ready = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
    // Also mark internally initiated connection promises as handled if a caller aborts early.
    void ready.catch(() => undefined);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const context: SocketContext = { socket, ready, resolve, reject, opened: false, ended: false, dedicated, pending: new Set(), clear: () => undefined };
    const onOpen = () => {
      if (context.ended) return;
      context.opened = true;
      if (timer) clearTimeout(timer);
      if (!dedicated) this.setStatus('open');
      resolve();
    };
    const onMessage = (event: Event) => this.receive(context, (event as MessageEvent<unknown>).data);
    const onError = () => this.endSocket(context, 'The API connection failed. A browser WebSocket does not expose the HTTP upgrade error; check the session with /whoami.', 'error');
    const onClose = () => this.endSocket(context, 'The API connection closed before all requested responses arrived.', 'closed');
    context.clear = () => {
      if (timer) clearTimeout(timer);
      socket.removeEventListener('open', onOpen);
      socket.removeEventListener('message', onMessage);
      socket.removeEventListener('error', onError);
      socket.removeEventListener('close', onClose);
    };
    socket.addEventListener('open', onOpen);
    socket.addEventListener('message', onMessage);
    socket.addEventListener('error', onError);
    socket.addEventListener('close', onClose);
    this.sockets.add(context);
    if (timeout > 0) timer = setTimeout(() => this.endSocket(context, 'The API connection timed out.', 'error', 'timeout'), timeout);
    if (socket.readyState === OPEN) queueMicrotask(onOpen);
    return context;
  }

  private endSocket(context: SocketContext, message: string, status: ConnectionStatus, kind: ApiErrorKind = 'transport') {
    if (context.ended) return;
    context.ended = true;
    context.clear();
    this.sockets.delete(context);
    if (this.main === context) this.main = undefined;
    if (!context.opened) context.reject(new ApiError(kind, message, { outcome: 'not-sent' }));
    for (const id of [...context.pending]) {
      const pending = this.pending.get(id);
      if (pending) this.fail(pending, this.interruptedRequest(pending, kind, message));
    }
    if (!context.dedicated) this.setStatus(status);
    try { context.socket.close(); } catch { /* Socket may already be closed. */ }
  }

  private interruptedRequest(pending: PendingRequest, kind: ApiErrorKind, message: string, cause?: unknown): ApiError {
    const unknown = pending.sent && pending.mutation;
    return new ApiError(unknown ? 'unknown' : kind, unknown ? 'The operation outcome is not confirmed. Refresh its current state before trying again.' : message, {
      requestId: pending.id, method: pending.type, cause,
      outcome: pending.sent ? 'unknown' : 'not-sent',
    });
  }

  request<T = unknown>(type: string, data?: unknown, options: RequestOptions = {}): Promise<ApiFrame<T>> {
    return new Promise((resolve, reject) => {
      this.begin(type, data, options, true, (frame) => resolve(frame as ApiFrame<T>), reject);
    });
  }

  stream<T = unknown>(type: string, data: unknown, options: StreamOptions<T>): Unsubscribe {
    return this.begin(type, data, options, false,
      (frame) => options.onFrame(frame as ApiFrame<T>),
      (error) => options.onError?.(error), options.onComplete);
  }

  private begin(type: string, data: unknown, options: RequestOptions, one: boolean,
    onFrame: (frame: ApiFrame) => void, onError: (error: ApiError) => void, onComplete?: () => void): Unsubscribe {
    const definition = getMethodDefinition(type);
    const id = typeof globalThis.crypto?.randomUUID === 'function' ? globalThis.crypto.randomUUID() : `request-${Date.now().toString(36)}-${++this.sequence}`;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const pending: PendingRequest = {
      id, type, active: true, sent: false, mutation: options.mutation ?? definition?.mutation ?? true, one,
      principal: record(data) && ((typeof data.st === 'string' && data.st.length > 0) || (typeof data.share_token === 'string' && data.share_token.length > 0)) ? 'shared' : 'account',
      responseTypes: options.responseTypes ?? (one ? [type] : definition?.responseTypes ?? [type]),
      completion: definition?.completion ?? 'single', seen: new Set(), onFrame, onError, onComplete,
      clear: () => { if (timer) clearTimeout(timer); if (abort) options.signal?.removeEventListener('abort', abort); },
    };
    this.pending.set(id, pending);
    let serialized: string;
    try {
      if (!type || unsupportedMethods.some((name) => name === type)) throw new ApiError('server', `The documented website API does not dispatch method "${type}".`, { method: type, outcome: 'not-sent' });
      if (data !== undefined && data !== null && !record(data)) throw new ApiError('server', 'WebSocket data must be a JSON object, null, or omitted.', { method: type, outcome: 'not-sent' });
      serialized = JSON.stringify({ type, id, data: data === undefined ? {} : data });
      const timeout = budget(options.timeoutMs, one ? this.config.timeoutMs ?? 30_000 : this.config.streamTimeoutMs ?? 60_000);
      abort = () => this.fail(pending, this.interruptedRequest(pending, 'transport', 'The API request was aborted.', options.signal?.reason));
      if (options.signal?.aborted) { abort(); return () => undefined; }
      options.signal?.addEventListener('abort', abort, { once: true });
      if (timeout > 0) timer = setTimeout(() => this.fail(pending, this.interruptedRequest(pending, 'timeout', 'The API request timed out.')), timeout);
    } catch (cause) {
      const error = cause instanceof ApiError ? cause : new ApiError('transport', 'The request cannot be encoded as JSON.', { cause, method: type, outcome: 'not-sent' });
      this.fail(pending, error);
      return () => undefined;
    }

    void (async () => {
      try {
        // Private detail has anonymous DNS/WHOIS frames. Every invocation owns its socket.
        const context = type === 'private_hostinfo' ? this.openSocket(true) : this.mainContext();
        pending.context = context;
        context.pending.add(id);
        await context.ready;
        if (!pending.active) return;
        if (context.socket.readyState !== OPEN) throw new Error('Socket is not open.');
        pending.sent = true;
        context.socket.send(serialized);
      } catch (cause) {
        if (pending.active) this.fail(pending, this.interruptedRequest(pending, cause instanceof ApiError ? cause.kind : 'transport', cause instanceof Error ? cause.message : 'The API request could not be sent.', cause));
      }
    })();
    return () => { this.finish(pending); };
  }

  private finish(pending: PendingRequest) {
    if (!pending.active) return;
    pending.active = false;
    pending.clear();
    this.pending.delete(pending.id);
    const context = pending.context;
    context?.pending.delete(pending.id);
    if (context?.dedicated && context.pending.size === 0 && !context.ended) this.endSocket(context, 'Private detail request finished.', 'closed');
  }

  private fail(pending: PendingRequest, error: ApiError) {
    if (!pending.active) return;
    this.finish(pending);
    callSafely(() => pending.onError(error));
  }

  private receive(context: SocketContext, raw: unknown) {
    if (context.ended || typeof raw !== 'string') return; // Binary frames are outside this API.
    let decoded: unknown;
    try { decoded = JSON.parse(raw); }
    catch { this.endSocket(context, 'The API sent invalid JSON.', 'error'); return; }
    if (!record(decoded) || typeof decoded.type !== 'string' || (decoded.id !== undefined && typeof decoded.id !== 'string') || (decoded.error !== undefined && typeof decoded.error !== 'string')) {
      this.endSocket(context, 'The API sent an invalid response envelope.', 'error'); return;
    }
    // A backend (or proxy) must not label creator metadata as the viewer's account.
    const frame = { ...decoded, context: undefined } as unknown as ApiFrame;
    let pending = frame.id ? this.pending.get(frame.id) : undefined;
    if (pending?.context !== context) pending = undefined;
    if (!pending && context.dedicated && (!frame.id || frame.id === '')) {
      const id = context.pending.values().next().value as string | undefined;
      const candidate = id ? this.pending.get(id) : undefined;
      if (candidate && (candidate.responseTypes.includes(frame.type) || (frame.error && frame.type === candidate.type))) pending = candidate;
    }
    const associated = pending?.active && (pending.responseTypes.includes(frame.type) || (frame.error && frame.type === pending.type));
    frame.context = { principal: associated ? pending!.principal : !frame.id && ['unread_notifications', 'high_load_status'].includes(frame.type) ? 'push' : 'unknown' };
    for (const listener of this.frameListeners) callSafely(() => listener(frame));
    if (!pending?.active) return;
    if (typeof frame.error === 'string' && frame.error.length > 0) {
      const outcome: OperationOutcome = pending.mutation && /^failed\b/i.test(frame.error.trim()) ? 'unknown' : 'rejected';
      this.fail(pending, new ApiError(classifyServerError(frame.error, undefined, frame), frame.error, { frame, requestId: pending.id, method: pending.type, outcome }));
      return;
    }
    if (!pending.responseTypes.includes(frame.type)) return;
    if (!hasOwn(frame, 'data')) {
      this.fail(pending, this.interruptedRequest(pending, 'transport', 'The API response omitted both data and error.'));
      return;
    }
    pending.seen.add(frame.type);
    try { pending.onFrame(frame); }
    catch (cause) {
      this.fail(pending, this.interruptedRequest(pending, 'transport', 'The response handler failed.', cause));
      return;
    }
    const complete = pending.one || this.streamComplete(pending, frame);
    if (complete && pending.active) {
      this.finish(pending);
      callSafely(pending.onComplete);
    }
  }

  private streamComplete(pending: PendingRequest, frame: ApiFrame): boolean {
    switch (pending.completion) {
      case 'facets': return record(frame.data) && frame.data.complete === true;
      case 'payment': return record(frame.data) && frame.data.status === 'completed';
      case 'host-sections':
      case 'private-host-sections':
      case 'ack-followup': return pending.responseTypes.every((type) => pending.seen.has(type));
      default: return true;
    }
  }
}

/** A real website API client. It never fabricates responses, logs in, or creates a guest. */
export function createApiClient(config: ApiClientConfig = {}): ApiClient { return new BrowserApiClient(config); }
