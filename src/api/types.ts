import type { ApiError } from './errors';
import type { ResponseMetadata } from './contracts';

/** A website WebSocket frame. An absent id is valid for pushes and private detail. */
export interface ApiFrame<T = unknown> {
  type: string;
  id?: string;
  data?: T;
  error?: string;
  metadata?: ResponseMetadata;
  /** Client-only provenance, derived from the matching outgoing request, never trusted from the wire. */
  context?: { principal: 'account' | 'shared' | 'push' | 'unknown' };
}

export type ConnectionStatus = 'idle' | 'connecting' | 'open' | 'closed' | 'error';
export type Unsubscribe = () => void;

export interface HttpOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
  /** Local request budget in milliseconds; zero disables it. */
  timeoutMs?: number;
  /** Overrides the conservative classification of non-GET/HEAD calls. */
  mutation?: boolean;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export interface RequestOptions {
  signal?: AbortSignal;
  mutation?: boolean;
  /** Local total budget, including connection establishment; zero disables it. */
  timeoutMs?: number;
  responseTypes?: readonly string[];
}

export interface StreamOptions<T = unknown> extends RequestOptions {
  onFrame: (frame: ApiFrame<T>) => void;
  onError?: (error: ApiError) => void;
  onComplete?: () => void;
}

/** Deliberately structural, so transport tests need no network or browser. */
export type WebSocketLike = Pick<WebSocket,
  'readyState' | 'send' | 'close' | 'addEventListener' | 'removeEventListener'>;

export interface ApiClientConfig {
  /** API origin or reverse-proxy base path. Defaults to the browser origin. */
  apiBaseUrl?: string;
  /** Defaults to the HTTP base followed by /ws, with the ws(s) scheme. */
  wsUrl?: string;
  fetch?: typeof globalThis.fetch;
  webSocketFactory?: (url: string) => WebSocketLike;
  timeoutMs?: number;
  streamTimeoutMs?: number;
  connectTimeoutMs?: number;
}

export interface ApiClient {
  /** Resolves a website HTTP route, including a configured reverse-proxy prefix. */
  url(path: string): string;
  http<T = unknown>(path: string, options?: HttpOptions): Promise<T>;
  httpResponse<T = unknown>(path: string, options?: HttpOptions): Promise<HttpResponse<T>>;
  /** Successful response bodies are not consumed: use for NDJSON/CSV streams. */
  raw(path: string, options?: HttpOptions): Promise<Response>;
  /** Resolves the first accepted frame. Use stream for multi-part methods. */
  request<T = unknown>(type: string, data?: unknown, options?: RequestOptions): Promise<ApiFrame<T>>;
  /** Returns immediately. Connection and server errors are reported to onError. */
  stream<T = unknown>(type: string, data: unknown, options: StreamOptions<T>): Unsubscribe;
  /** Observes every decoded frame, including pushes, follow-up lists and metadata. */
  subscribe(listener: (frame: ApiFrame) => void): Unsubscribe;
  connect(): Promise<void>;
  disconnect(): void;
  getConnectionStatus(): ConnectionStatus;
  subscribeConnection(listener: (status: ConnectionStatus) => void): Unsubscribe;
}
