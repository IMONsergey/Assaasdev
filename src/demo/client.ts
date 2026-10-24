import {
  ApiError, getMethodDefinition,
  type AnalyticsFacet, type ApiClient, type ApiFrame, type BucketDownloadRequest,
  type BucketFilter, type ConnectionStatus, type HttpOptions,
  type HttpResponse, type Profile, type RequestOptions,
  type ResponseMetadata, type SearchFilter, type SearchRequest, type StreamOptions,
} from '../api';
import {
  DEFAULT_SCAN_PORTS, DEMO_BACKUP_CODES, DEMO_CODE, DEMO_TIMESTAMP, DEMO_PAYMENT_ADDRESS, seedBuckets,
  seedHosts, seedNotifications, seedPayments, seedPlanning, seedPricing, seedProfile,
  seedSavedQueries, seedSessions, seedTasks, seedTrackedAddresses, seedAddressTransactions,
} from './fixtures';
import { DEMO_FACETS, DEMO_FIELDS, facetData, fieldValues, matchingBuckets, matchingHosts } from './search';
import { PRESENTATION_NETWORKS, presentationCryptoQuote, registerPresentationPayments, type PresentationOrder } from './presentation-payments';
import { browserOrderStorage, PRESENTATION_ORDER_KEY, readPresentationOrders, writePresentationOrders, type OrderStorage, type StoredPresentationOrder } from './presentation-order-store';

/** Testable clock and animation delay; never accepts live endpoint credentials. */
export interface DemoApiOptions { now?: () => number; delayMs?: number; orderStorage?: OrderStorage | null }
type Data = Record<string, unknown>;
type Principal = 'authenticated' | 'anonymous' | 'guest' | 'pending-2fa';
interface Share { data: string; expires: number; remaining: number; owner: Profile }
const clone = <T>(value: T): T => structuredClone(value);
const text = (value: unknown): string => typeof value === 'string' ? value : '';
const emailValid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const stringArray = (value: unknown): string[] => Array.isArray(value) && value.every(item => typeof item === 'string') ? value : [];
const origin = () => typeof location !== 'undefined' ? location.origin : 'http://localhost';
const caps: Record<string, number> = { Guest: 2, Free: 2, Plus: 25, Expert: 150, Business: 300 };
const sessionCaps: Record<string, number> = { Free: 1, Plus: 3, Expert: 5, Business: 10 };
const planRank: Record<string, number> = { Guest: 0, Free: 0, Plus: 1, Expert: 2, Business: 3 };
const restrictions: Record<string, { fields: string[]; values: string[]; hidden: string[] }> = {
  Free: { fields: ['exposed_data', 'cve_id', 'base_score', 'min_size_mb', 'max_size_mb', 'cts', 'uts', 'port_count', 'security_body'], values: ['leak', 'vulnerability', 'bucket', 'security_txt'], hidden: ['exposed_data'] },
  Plus: { fields: ['exposed_data', 'min_size_mb', 'max_size_mb', 'cts', 'uts', 'port_count', 'security_body'], values: ['leak', 'security_txt'], hidden: ['exposed_data'] },
  Expert: { fields: ['security_body'], values: ['security_txt'], hidden: [] },
  Business: { fields: [], values: [], hidden: [] },
};
const sharedMethods = new Set(['hosts', 'analytics', 'hostinfo', 'private_hosts', 'private_analytics', 'private_hostinfo']);
const guestMethods = new Set(['hosts', 'analytics', 'hostinfo', 'cveinfo', 'autocomplete', 'analytics_settings', 'analytics_settings_delete', 'short_link_create', 'share_link_create']);
function object(value: unknown): Data {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new ApiError('server', 'Invalid request data: expected an object');
  return value as Data;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Data)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function withoutToken(data: Data): Data {
  const result = { ...data }; delete result.st; delete result.share_token; return result;
}
function asApiError(error: unknown): ApiError {
  return error instanceof ApiError ? error : new ApiError('server', error instanceof Error ? error.message : 'The operation could not be completed', { cause: error });
}
function aborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ApiError('transport', 'Request was aborted before it was sent.', { outcome: 'not-sent', cause: signal.reason });
}
function validQuery(input: unknown): string {
  let value = text(input).trim();
  if (/^https?:\/\//i.test(value)) value = value.slice(value.indexOf('?') + 1);
  if (!value) throw new ApiError('server', 'query is required');
  if (value.length > 8192) throw new ApiError('server', 'invalid query: query string too long');
  if (/[\u0000-\u001f\u007f]/.test(value) || value.startsWith('/') || value.includes('../') || /(?:https?:|javascript:|data:|\/\/)/i.test(value)) throw new ApiError('server', 'invalid query: query contains invalid or dangerous content');
  return value.replace(/^\?/, '');
}
function requiredString(data: Data, key: string, message = `${key} is required`): string {
  const value = text(data[key]).trim(); if (!value) throw new ApiError('server', message); return value;
}
function page(data: Data, limit = 50): { start: number; size: number } {
  const number = data.page === undefined ? 1 : Number(data.page), size = data.docs_per_page === undefined ? 20 : Number(data.docs_per_page);
  if (!Number.isInteger(number) || number < 1 || !Number.isInteger(size) || size < 1 || size > limit) throw new ApiError('server', `page must be positive and docs_per_page must be between 1 and ${limit}`);
  return { start: (number - 1) * size, size };
}

/**
 * An isolated implementation for product review. It never constructs a fetch,
 * WebSocket or external payment. A bounded, non-sensitive order ledger can survive
 * reload in the same browser tab; all other workspace state is in memory.
 */
export function createDemoApi(options: DemoApiOptions = {}): ApiClient {
  const clock = options.now ?? Date.now;
  const now = () => Math.floor(clock() / 1000);
  const startedAt = now();
  const orderStorage = options.orderStorage === undefined ? browserOrderStorage() : options.orderStorage;
  const restoredOrders = readPresentationOrders(orderStorage, seedProfile(startedAt).user_id!, startedAt);
  const seedEpoch = restoredOrders?.seedEpoch ?? startedAt;
  const delay = Math.max(0, options.delayMs ?? 18);
  let principal: Principal = 'authenticated', profile = seedProfile(seedEpoch), guestRemaining = 20, guestDay = Math.floor(seedEpoch / 86400);
  let connection: ConnectionStatus = 'idle', sequence = 10, keyVersion = 1, deletedPaymentCount = 0;
  let sessions = seedSessions(seedEpoch).sessions, saved = seedSavedQueries(seedEpoch), tasks = seedTasks(seedEpoch), planned = seedPlanning();
  let payments = seedPayments(seedEpoch), notifications = seedNotifications(seedEpoch).notifications;
  // Account-wallet orders exist only in this isolated adapter. They never call a payment provider.
  const walletOrders = new Map<string, { owner: Profile; request: Data; amount: number; status: 'pending' | 'completed' | 'failed' | 'canceled' | 'expired' }>();
  const purchaseOrders = new Map<string, { owner: Profile; request: Data; detail: PresentationOrder }>();
  const settlementSequences = new Map<string, number>();
  let nextSettlementSequence = 0;
  const fixtureOwner = profile;
  purchaseOrders.set('pay_001', { owner: profile, request: { subscription: 'Plus', cadence: 'monthly', network: 'Ethereum', coin: 'USDT' }, detail: { paymentId: 'pay_001', method: 'crypto', status: 'pending', product: 'Plus', kind: 'plan', cadence: 'monthly', subtotal: 50, discount: 0, total: 50, currency: 'USD', createdAt: seedEpoch, updatedAt: seedEpoch, expiresAt: seedEpoch + 3600, authorized: false, network: 'Ethereum', coin: 'USDT', reference: 'APCO-PAY-001', ...presentationCryptoQuote(50, 'USDT'), request: { subscription: 'Plus', cadence: 'monthly' } } });
  let backupCodes = [...DEMO_BACKUP_CODES], totpExpires = 0;
  let pendingProfile: { email: string; user_name: string; expires: number } | undefined;
  const pendingAccounts = new Map<string, { user_name: string; password: string }>();
  const accounts = new Map<string, Profile>([['alex@example.com', profile], ['alex_research', profile]]);
  const hosts = seedHosts(), buckets = seedBuckets(), pricing = seedPricing(seedEpoch), deletedResults = new Set<string>();
  const shares = new Map<string, Share>(), shortLinks = new Map<string, string>();
  const listeners = new Set<(frame: ApiFrame) => void>(), connectionListeners = new Set<(status: ConnectionStatus) => void>();
  const active = new Set<(reason?: ApiError) => void>();
  const id = (prefix: string) => `${prefix}-${String(++sequence).padStart(5, '0')}`;
  function status(next: ConnectionStatus) { connection = next; for (const listener of connectionListeners) { try { listener(next); } catch { /* One observer cannot break the adapter. */ } } }
  function emit(frame: ApiFrame) { for (const listener of listeners) { try { listener(clone(frame)); } catch { /* Isolate observers. */ } } }
  function close(reason = new ApiError('transport', 'Connection closed.', { outcome: 'unknown' })) { for (const stop of [...active]) stop(reason); status('closed'); }
  function requireSession(accountOnly = false) {
    if (principal === 'pending-2fa') throw new ApiError('auth', 'Session requires 2FA verification', { status: 401 });
    if (principal === 'anonymous' || (accountOnly && principal !== 'authenticated')) throw new ApiError('auth', 'Unauthorized', { status: 401 });
  }
  function currentProfile(): Profile {
    requireSession();
    if (principal !== 'guest') return profile;
    refreshGuestDay();
    return { user_type: 'GUEST', daily_search_limit: 20, remaining_daily_searches: guestRemaining, subscription: { type: 'Guest' }, analytics_facets: guestFacets };
  }
  let guestFacets: AnalyticsFacet[] = [{ key: 'type', enabled: true, priority: 0 }];
  function refreshGuestDay() { const day = Math.floor(now() / 86400); if (day !== guestDay) { guestDay = day; guestRemaining = 20; } }
  function metadata(owner = currentProfile(), charged = false): ResponseMetadata {
    const plan = owner.subscription?.type ?? 'Free', rule = restrictions[plan === 'Guest' ? 'Free' : plan] ?? restrictions.Free;
    return { subscription_type: plan, auth_required: false, full_access: false, search_restrictions: { blocked_fields: rule.fields, blocked_values: rule.values }, result_restrictions: { hidden_fields: rule.hidden, hidden_labels: rule.values },
      ...(charged && owner.user_type !== 'GUEST' ? { credits: owner.credits, timestamp: now() } : {}),
      ...(owner.user_type === 'GUEST' ? { guest_access: { daily_limit: 20, remaining_daily_searches: guestRemaining } } : {}) };
  }
  function notificationData(unreadOnly = false, limit = 20, offset = 0) {
    const values = unreadOnly ? notifications.filter(item => !item.is_read) : notifications;
    return { notifications: values.slice(offset, offset + limit), total: values.length, unread_count: notifications.filter(item => !item.is_read).length, timestamp: now() };
  }
  function pushNotifications() { if (principal === 'authenticated') emit({ type: 'unread_notifications', id: '', data: notificationData(true, 10), context: { principal: 'push' } }); }
  function notify(type: string, message: string) { notifications.unshift({ id: id('notification'), notification_type: type, message, payload: {}, is_read: false, created_at: now() }); pushNotifications(); }
  function sessionData() { return { sessions, total: sessions.length, limit: sessionCaps[profile.subscription?.type ?? 'Free'] ?? 1 }; }
  function authenticated() {
    const authenticatedAt = now();
    principal = 'authenticated';
    if (!sessions.some(session => session.is_current)) sessions.unshift({ ...seedSessions(authenticatedAt).sessions[0], created_at: authenticatedAt, authenticated_at: authenticatedAt });
    sessions = sessions.slice(0, sessionCaps[profile.subscription?.type ?? 'Free'] ?? 1);
    profile.session_id = 'session_current';
    profile.authenticated_at = authenticatedAt;
  }
  function httpError(statusCode: number, message: string): never { throw new ApiError(statusCode === 401 ? 'auth' : statusCode === 429 ? 'rate' : 'server', message, { status: statusCode }); }
  function httpRoute(path: string, input: HttpOptions): { data: unknown; status: number } {
    const route = new URL(path, origin()).pathname, method = (input.method ?? (input.body === undefined ? 'GET' : 'POST')).toUpperCase();
    const body = object(input.body), ok = (data: unknown, responseStatus = 200) => ({ data, status: responseStatus });
    if (method === 'GET' && route === '/whoami') return ok(currentProfile());
    if (method === 'GET' && route === '/pricing') return ok(pricing);
    if (method === 'GET' && route === '/api/statistics') return ok({ success: true, data: { protocols: 3, products: hosts.reduce((sum, host) => sum + (host.detail.ports?.length ?? 0), 0), unique_products: 3, cves: 1, ipv4: 8, ipv6: 2, domains: 2, last_updated_timestamp: DEMO_TIMESTAMP } });
    if (method === 'GET' && route === '/auth/logout') { requireSession(); principal = 'anonymous'; sessions = []; close(); return ok({ message: 'Successfully logged out and all sessions closed' }); }
    if (method === 'POST' && route === '/auth/guest') {
      if (principal === 'authenticated') httpError(403, 'Sign out before starting a guest session');
      principal = 'guest'; refreshGuestDay(); close(); return ok({ success: true });
    }
    if (method === 'POST' && route === '/auth/login') {
      const identifier = text(body.identifier).trim(), password = text(body.password);
      if (!identifier || password.length < 6) httpError(400, 'Validation failed: identifier is required and password must be at least 6 characters');
      const account = accounts.get(identifier.toLowerCase()); if (account) profile = account;
      // Deliberately accepts any valid identifier/password in demo, not real authentication.
      if (identifier.toLowerCase().includes('2fa') || profile.totp_active) { principal = 'pending-2fa'; close(); return ok({ message: '2FA verification required' }, 202); }
      authenticated(); return ok({ message: 'Successfully logged in' });
    }
    if (method === 'POST' && route === '/auth/totp/verify') {
      if (principal !== 'pending-2fa') httpError(401, 'No pending 2FA session');
      const backup = text(body.backup_code), code = text(body.code);
      if (backup) { const index = backupCodes.indexOf(backup); if (index < 0) httpError(400, 'Invalid backup code'); backupCodes.splice(index, 1); }
      else if (code !== DEMO_CODE) httpError(400, 'Invalid 2FA code');
      authenticated(); return ok({ message: '2FA verified successfully' });
    }
    if (method === 'POST' && route === '/auth/signup') {
      const email = text(body.email).trim(), userName = text(body.user_name).trim(), password = text(body.password);
      if (Object.keys(body).some(key => !['email', 'user_name', 'password'].includes(key))) httpError(400, 'Invalid request data: unknown field');
      if (!emailValid(email) || !userName || password.length < 18) httpError(400, 'Validation failed: email, user name and a password of at least 18 characters are required');
      if (email.toLowerCase() === 'taken@example.com' || [profile.email, profile.user_name].includes(email) || [profile.email, profile.user_name].includes(userName) || accounts.has(email.toLowerCase()) || accounts.has(userName.toLowerCase())) httpError(409, 'email or user_name already exists');
      if (email.toLowerCase() === 'rate@example.com') httpError(429, 'Registration from this IP is temporarily limited. Try again later');
      pendingAccounts.set(email.toLowerCase(), { user_name: userName, password });
      return ok({ message: 'Verification code sent to email' });
    }
    if (method === 'POST' && route === '/auth/verify') {
      if (text(body.code) !== DEMO_CODE) httpError(400, 'Invalid or expired code');
      const email = text(body.email).trim().toLowerCase(), pending = pendingAccounts.get(email);
      if (!pending) httpError(400, 'Pending user not found or expired');
      const account: Profile = { user_id: id('usr'), email, user_name: pending.user_name, user_type: 'USER', credits: 500, scan_credits: 0, balance: 0, purchased_credits: 0, subscription: { type: 'Free', search_pages: 2, credits: 500, scan_credits: 0, api_access: false }, totp_active: false, analytics_facets: clone(guestFacets) };
      accounts.set(email, account); accounts.set(pending.user_name.toLowerCase(), account); pendingAccounts.delete(email);
      // Account creation does not manufacture a login cookie or authenticated session.
      return ok({ message: 'Email verified successfully. Sign in to continue.' });
    }
    if (method === 'POST' && route === '/auth/password-recovery/request') {
      if (!text(body.identifier).trim()) httpError(400, 'Validation failed: identifier is required');
      return ok({ message: 'If this account exists, a password reset code has been sent.' });
    }
    if (method === 'POST' && route === '/auth/password-recovery/confirm') {
      if (!text(body.identifier).trim() || text(body.new_password).length < 6) httpError(400, 'Validation failed: new password must be at least 6 characters');
      if (text(body.reset_code) !== DEMO_CODE) httpError(400, 'Invalid or expired code');
      return ok({ message: 'Password reset successfully' });
    }
    if (method === 'POST' && route === '/auth/password-reset') {
      requireSession(true);
      if (text(body.old_password).length < 6 || text(body.new_password).length < 6) httpError(400, 'Password must be at least 6 characters');
      return ok({ message: 'Password changed successfully' });
    }
    if (method === 'POST' && route === '/profile/update') {
      requireSession(true);
      const email = text(body.email).trim(), userName = text(body.user_name).trim();
      if (!emailValid(email)) httpError(400, 'Invalid email');
      if (text(body.password).length < 6) httpError(400, 'Password must be at least 6 characters');
      if (email === 'taken@example.com') httpError(409, 'This email is already in use');
      if (profile.totp_active && text(body.totp_code) !== DEMO_CODE) httpError(400, 'Invalid 2FA code');
      pendingProfile = { email, user_name: userName || profile.user_name || '', expires: now() + 900 };
      return ok({ message: 'Verification code sent. Current email remains active until verification.' });
    }
    if (method === 'POST' && route === '/profile/verify') {
      requireSession(true);
      if (text(body.code) !== DEMO_CODE || !pendingProfile || pendingProfile.expires <= now()) httpError(400, 'Invalid or expired code');
      const oldEmail = profile.email, oldName = profile.user_name;
      profile.email = pendingProfile.email; profile.user_name = pendingProfile.user_name; pendingProfile = undefined;
      if (oldEmail) accounts.delete(oldEmail.toLowerCase()); if (oldName) accounts.delete(oldName.toLowerCase());
      accounts.set(profile.email.toLowerCase(), profile); accounts.set(profile.user_name.toLowerCase(), profile);
      return ok({ message: 'Profile updated successfully' });
    }
    throw new ApiError('server', `This service is currently unavailable.`, { status: 501, outcome: 'not-sent' });
  }

  function ownerFor(type: string, data: Data): { owner: Profile; shared: boolean } {
    requireSession();
    const token = text(data.st) || text(data.share_token);
    if (token) {
      if (!sharedMethods.has(type)) throw new ApiError('auth', 'Unauthorized or share token required for this method');
      const share = shares.get(token);
      if (!share || share.expires <= now() || share.remaining < 1) throw new ApiError('server', 'Invalid or expired share link');
      if (canonical(withoutToken(data)) !== share.data) throw new ApiError('server', 'Request does not match share link');
      share.remaining -= 1;
      return { owner: share.owner, shared: true };
    }
    if (principal === 'guest' && !guestMethods.has(type)) throw new ApiError('auth', 'Unauthorized or share token required for this method');
    return { owner: currentProfile(), shared: false };
  }
  function checkAccess(type: string, data: Data, owner: Profile) {
    const plan = owner.subscription?.type ?? 'Free', rank = planRank[plan] ?? 0;
    if ((type.startsWith('private_') || ['org_add', 'org_remove'].includes(type)) && rank < 3) throw new ApiError('server', 'Business subscription required');
    if (['buckets', 'bucket_analytics', 'query_create', 'query_list', 'query_delete', 'regenerate_api_key'].includes(type) && rank < 1) throw new ApiError('server', 'Plus subscription required');
    if (data.page !== undefined && (!Number.isInteger(data.page) || Number(data.page) < 1 || Number(data.page) > (caps[plan] ?? 2))) throw new ApiError('server', `Page limit exceeded for ${plan} subscription`);
    if (data.docs_per_page !== undefined && (!Number.isInteger(data.docs_per_page) || Number(data.docs_per_page) < 1 || Number(data.docs_per_page) > 50)) throw new ApiError('server', 'docs_per_page cannot exceed 50');
    if (sharedMethods.has(type)) {
      const rule = restrictions[plan === 'Guest' ? 'Free' : plan] ?? restrictions.Free;
      function leaf(filter: SearchFilter) {
        if (filter.field && rule.fields.includes(filter.field)) throw new ApiError('server', `Field ${filter.field} is not available for ${plan}`);
        if (filter.value && rule.values.includes(filter.value)) throw new ApiError('server', `Value ${filter.value} is not available for ${plan}`);
        filter.filters?.forEach(leaf);
      }
      const query = data as SearchRequest;
      query.simple_search_filters?.forEach(leaf);
      for (const field of rule.fields) if (data[field] !== undefined && data[field] !== '') throw new ApiError('server', `Field ${field} is not available for ${plan}`);
      for (const range of query.range_filter ?? []) if (rule.fields.includes(range.field)) throw new ApiError('server', `Field ${range.field} is not available for ${plan}`);
    }
  }
  function charge(owner: Profile, cost: number): boolean {
    if (cost <= 0) return false;
    if (owner.user_type === 'GUEST') {
      refreshGuestDay();
      if (guestRemaining <= 0) throw new ApiError('auth', 'Guest daily search limit reached. Sign in to continue.');
      guestRemaining -= 1; return false;
    }
    if ((owner.credits ?? 0) < cost) throw new ApiError('server', 'Not enough credits');
    owner.credits = (owner.credits ?? 0) - cost; return true;
  }
  function visibleHost<T>(value: T, owner: Profile): T {
    const result = clone(value) as T & { labels_list?: string[]; ports?: { detected_products?: { labels?: string[]; exposed_data?: unknown }[] }[] };
    const rule = restrictions[owner.subscription?.type === 'Guest' ? 'Free' : owner.subscription?.type ?? 'Free'] ?? restrictions.Free;
    if (result.labels_list) result.labels_list = result.labels_list.filter(label => !rule.values.includes(label));
    for (const port of result.ports ?? []) for (const product of port.detected_products ?? []) {
      if (rule.hidden.includes('exposed_data')) delete product.exposed_data;
      if (product.labels) product.labels = product.labels.filter(label => !rule.values.includes(label));
    }
    return result;
  }
  function purchase(data: Data) {
    if (!!data.subscription === !!data.token_pack_id) throw new ApiError('server', 'Provide exactly one of subscription or token_pack_id');
    const plan = pricing.subscriptions.find(item => item.type === data.subscription);
    const pack = pricing.tokens.find(item => item.id === data.token_pack_id);
    if (!plan && !pack) throw new ApiError('server', 'Unknown subscription or token pack');
    if (plan && !['monthly', 'annually'].includes(text(data.cadence))) throw new ApiError('server', 'cadence must be monthly or annually');
    const amount = plan ? data.cadence === 'annually' ? plan.annually_price : plan.monthly_price : pack!.price_usd;
    return { amount, final: Math.round(amount * (text(data.promo_code).toUpperCase() === 'WELCOME' ? 0.9 : 1) * 100) / 100, plan, pack };
  }
  function grantPurchase(owner: Profile, request: Data, paymentId: string, amount: number, settledAt: number) {
    const { plan, pack } = purchase(request);
    if (pack) {
      owner.credits = (owner.credits ?? 0) + pack.tokens;
      owner.purchased_credits = (owner.purchased_credits ?? 0) + pack.tokens;
    } else if (plan) {
      const days = request.cadence === 'annually' ? 365 : 30;
      owner.subscription = { type: plan.type, start_date: settledAt, expiry_date: settledAt + days * 86400, last_payment: paymentId, credits: plan.credits, scan_credits: plan.scan_credits, search_pages: plan.search_pages, api_access: plan.api_access, price: amount, payment_required: true, duration: days * 86400 * 1e9, canceled: false };
      owner.credits = (plan.credits ?? 0) + (owner.purchased_credits ?? 0);
      owner.scan_credits = plan.scan_credits ?? 0;
    }
  }
  function savePresentationOrders() {
    const orders: StoredPresentationOrder[] = [];
    for (const [paymentId, item] of purchaseOrders) {
      if (item.owner !== fixtureOwner) continue;
      const payment = payments.find(value => value.payment_id === paymentId), detail = item.detail;
      orders.push({ paymentId, method: detail.method, status: payment?.status as StoredPresentationOrder['status'] ?? detail.status, request: { ...detail.request, ...(detail.method === 'crypto' ? { network: detail.network, coin: detail.coin } : {}) }, createdAt: detail.createdAt, updatedAt: payment?.updated_at ?? detail.updatedAt, expiresAt: detail.expiresAt, completedAt: payment?.completed_at ?? detail.completedAt, settlementSequence: settlementSequences.get(paymentId), authorized: detail.authorized, removed: !payment, ...(detail.method === 'crypto' ? { cryptoAmount: detail.cryptoAmount, quoteUsd: detail.quoteUsd } : {}) });
    }
    writePresentationOrders(orderStorage, { version: 1, owner: fixtureOwner.user_id!, seedEpoch, writtenAt: now(), orders });
  }
  function purchaseDetail(paymentId: string): PresentationOrder | undefined {
    const order = purchaseOrders.get(paymentId), payment = payments.find(item => item.payment_id === paymentId);
    if (principal !== 'authenticated' || !order || !payment || order.owner !== profile) return undefined;
    const checkedAt = now();
    if (payment.status === 'pending' && order.detail.expiresAt <= checkedAt) {
      payment.status = 'expired'; payment.updated_at = checkedAt;
      const wallet = walletOrders.get(paymentId); if (wallet?.status === 'pending') wallet.status = 'expired';
      savePresentationOrders();
    }
    order.detail.status = payment.status as PresentationOrder['status'];
    order.detail.updatedAt = payment.updated_at ?? order.detail.createdAt;
    order.detail.completedAt = payment.completed_at;
    return clone(order.detail);
  }
  function settlePresentation(paymentId: string) {
    const settledAt = now(), order = purchaseOrders.get(paymentId), payment = payments.find(item => item.payment_id === paymentId);
    if (!order || !payment) return { payment_id: paymentId, status: 'canceled', message: 'This order is no longer available.', timestamp: settledAt };
    if (payment.status === 'pending') {
      if (order.detail.expiresAt <= settledAt) payment.status = 'expired';
      else if (order.detail.authorized) {
        grantPurchase(order.owner, order.request, paymentId, order.detail.total, settledAt);
        settlementSequences.set(paymentId, ++nextSettlementSequence);
        payment.status = 'completed'; payment.completed_at = settledAt;
      }
      if (payment.status !== 'pending') payment.updated_at = settledAt;
    }
    order.detail.status = payment.status as PresentationOrder['status'];
    order.detail.updatedAt = payment.updated_at ?? order.detail.createdAt;
    order.detail.completedAt = payment.completed_at;
    savePresentationOrders();
    return { payment_id: paymentId, status: payment.status, subscription_type: order.owner.subscription?.type, expiry_date: order.owner.subscription?.expiry_date, message: payment.status === 'completed' ? 'Payment completed. Your account has been updated.' : payment.status === 'expired' ? 'This order has expired. Create a new order to continue.' : payment.status === 'canceled' ? 'This order was canceled.' : 'Your order is awaiting payment.', timestamp: settledAt };
  }
  function settleWallet(paymentId: string) {
    const settledAt = now();
    const order = walletOrders.get(paymentId), payment = payments.find(item => item.payment_id === paymentId);
    if (!order || !payment) return { payment_id: paymentId, status: 'canceled', message: 'This payment was canceled before completion.', timestamp: settledAt };
    if (order.status === 'pending') {
      if ((payment.expires_at ?? Infinity) <= settledAt) order.status = 'expired';
      else if ((order.owner.balance ?? 0) < order.amount) order.status = 'failed';
      else {
        order.owner.balance = Math.round(((order.owner.balance ?? 0) - order.amount) * 100) / 100;
        grantPurchase(order.owner, order.request, paymentId, order.amount, settledAt);
        settlementSequences.set(paymentId, ++nextSettlementSequence);
        order.status = 'completed'; payment.completed_at = settledAt;
      }
      payment.status = order.status; payment.updated_at = settledAt;
      const detail = purchaseOrders.get(paymentId)?.detail;
      if (detail) { detail.status = order.status; detail.updatedAt = settledAt; detail.completedAt = payment.completed_at; }
      savePresentationOrders();
    }
    return { payment_id: paymentId, status: order.status, subscription_type: order.owner.subscription?.type, expiry_date: order.owner.subscription?.expiry_date,
      message: order.status === 'completed' ? 'Payment completed. Your account has been updated.' : order.status === 'expired' ? 'This payment expired. Start a new purchase when you are ready.' : 'The payment could not be completed. Your wallet was not charged.', timestamp: settledAt };
  }
  function taskInput(data: Data) {
    const hosts = stringArray(data.host_list), cidrs = stringArray(data.cidr_list), ports = Array.isArray(data.port_list) && data.port_list.length ? data.port_list as number[] : [...DEFAULT_SCAN_PORTS];
    if (!hosts.length && !cidrs.length) throw new ApiError('server', 'At least one host or CIDR is required');
    if (ports.some(port => !Number.isInteger(port) || port < 1 || port > 65535)) throw new ApiError('server', 'Ports must be integers from 1 to 65535');
    const schedule = text(data.schedule).trim();
    if (schedule && (schedule.split(/\s+/).length !== 6 || !/^[\d*,/\-\s]+$/.test(schedule))) throw new ApiError('server', 'Invalid schedule: expected six cron fields including seconds');
    let addressCount = hosts.length;
    for (const cidr of cidrs) {
      const [network, prefixText] = cidr.split('/'), prefix = Number(prefixText);
      const ipv6 = network.includes(':'), bits = ipv6 ? 128 : 32;
      if (!prefixText || !Number.isInteger(prefix) || prefix < 0 || prefix > bits || (!ipv6 && !/^(\d{1,3}\.){3}\d{1,3}$/.test(network)) || (!ipv6 && network.split('.').some(part => Number(part) > 255))) throw new ApiError('server', `Failed to deduct credits: invalid CIDR ${cidr}`);
      // A bounded IPv6 demo rejects oversized scans explicitly; it never submits targets.
      if (bits - prefix > 30) throw new ApiError('server', 'This CIDR exceeds the scan capacity');
      addressCount += Math.max(0, 2 ** (bits - prefix) - (ipv6 ? 0 : 2));
    }
    return { host_list: hosts, cidr_list: cidrs, port_list: ports, schedule, workers: 500, cost: addressCount * ports.length };
  }

  function frames(type: string, data: Data, requestId: string): { frames: ApiFrame[]; persistent?: boolean; intervalMs?: number; beforeDelivery?: (frame: ApiFrame, index: number) => ApiFrame } {
    if (!getMethodDefinition(type)) throw new ApiError('server', `Unknown request type: ${type}`, { outcome: 'not-sent' });
    const { owner, shared } = ownerFor(type, data); checkAccess(type, data, owner);
    const query = data as SearchRequest, privateData = type.startsWith('private_');
    let charged = false;
    const result = (value: unknown, responseType = type): ApiFrame => ({ type: responseType, id: requestId, data: clone(value), metadata: metadata(owner, charged), context: { principal: shared ? 'shared' : 'account' } });
    const one = (value: unknown) => ({ frames: [result(value)] });
    if (type === 'hosts' || type === 'private_hosts') {
      const { start, size } = page(data), values = matchingHosts(hosts, query, privateData, deletedResults);
      charged = charge(owner, 1); return one(values.slice(start, start + size).map(host => visibleHost(host.card, owner)));
    }
    if (type === 'analytics' || type === 'private_analytics') {
      const values = matchingHosts(hosts, query, privateData, deletedResults);
      const settings = owner.user_type === 'GUEST' ? guestFacets : owner.analytics_facets ?? seedProfile().analytics_facets!;
      const names = !query.full_text_search && !query.simple_search_filters?.length ? ['type'] : settings.filter(facet => facet.enabled && DEMO_FACETS.includes(facet.key)).sort((a, b) => a.priority - b.priority).map(facet => facet.key);
      const facets = names.map(name => facetData(values, name)); charged = charge(owner, privateData ? 1 : Math.ceil(facets.length / 4));
      return { frames: [...facets.map(facet => result(facet)), result({ complete: true })] };
    }
    if (type === 'analytics_settings' || type === 'analytics_settings_delete') {
      const settings: AnalyticsFacet[] = type === 'analytics_settings_delete' ? clone(seedProfile().analytics_facets!) : (Array.isArray(data.facets) ? data.facets : []).filter((facet): facet is AnalyticsFacet => !!facet && typeof facet === 'object' && DEMO_FACETS.includes(text((facet as Data).key))).map((facet, index) => ({ key: facet.key, enabled: facet.enabled === true, priority: Number.isFinite(facet.priority) ? facet.priority : index }));
      if (owner.user_type === 'GUEST') guestFacets = settings; else owner.analytics_facets = settings;
      return one({ success: true });
    }
    if (type === 'hostinfo' || type === 'private_hostinfo') {
      if (!query.ip) throw new ApiError('server', 'please write ip for search');
      const host = matchingHosts(hosts, query, privateData, deletedResults)[0]; charge(owner, 1);
      const section = (sectionType: string, value: unknown): ApiFrame => ({ type: sectionType, ...(privateData ? {} : { id: requestId }), data: clone(value), context: { principal: shared ? 'shared' : 'account' } });
      const dns = host ? { updated_at: DEMO_TIMESTAMP, records: { A: host.detail.type === 'ipv4' ? [host.card.ip] : [], AAAA: host.detail.type === 'ipv6' ? [host.card.ip] : [], MX: ['mail.example.com'], TXT: ['v=spf1 -all'] } } : null;
      const whois = host ? { domain_name: host.host, registrar: 'Example Registrar', organization: host.card.org, creation_date: '2020-01-01', updated_date: '2026-10-01', status: ['active'], raw: 'Domain: example.com\nStatus: active\nRegistrar: Example Registrar' } : null;
      const sections = [section('dnsinfo', dns), section(type, host ? visibleHost(host.detail, owner) : {}), section('whois', whois)];
      if (!privateData) sections.push(section('domain_ip_map', host ? [{ d: host.host, ip: host.card.ip, uts: DEMO_TIMESTAMP }] : []));
      return { frames: sections };
    }
    if (type === 'cveinfo') {
      requiredString(data, 'cve_ID');
      return one({});
    }
    if (type === 'autocomplete') {
      const value = requiredString(data, 'query', 'query is required').toLowerCase(), field = text(data.field);
      const possibilities = field ? [...new Set(hosts.flatMap(host => fieldValues(host, field)).map(String))] : DEMO_FIELDS;
      const matches = possibilities.filter(item => value === '*' || item.toLowerCase().includes(value));
      const results = matches.slice(0, 10); return one({ type: field ? 'values' : 'fields', field, results, has_more: results.length === 10 });
    }
    if (type === 'buckets' || type === 'bucket_analytics') {
      const values = matchingBuckets(buckets, data as BucketFilter); charged = charge(owner, 1);
      if (type === 'buckets') { const { start, size } = page({ ...data, docs_per_page: data.docs_per_page ?? 50 }); return one({ result_count: values.length, result: values.slice(start, start + size) }); }
      const grouped = new Map<string, { host: string; container?: string; file_count: number }>();
      for (const value of values) { const key = `${value.host}/${value.container ?? ''}`; const group = grouped.get(key) ?? { host: value.host ?? '', container: value.container, file_count: 0 }; group.file_count++; grouped.set(key, group); }
      const { start, size } = page({ ...data, docs_per_page: data.docs_per_page ?? 50 });
      return one({ result_count: grouped.size, result: [...grouped.values()].slice(start, start + size) });
    }
    if (type === 'query_list') return one(saved);
    if (type === 'query_create') {
      if (saved.length >= 20) throw new ApiError('server', 'Saved queries limit reached (max 20)');
      saved.unshift({ id: (++sequence).toString(16).padStart(24, '0'), query: JSON.stringify(data), created_at: now(), updated_at: now() }); return one({ success: true });
    }
    if (type === 'query_delete') {
      const key = requiredString(data, 'id'); if (!/^[\da-f]{24}$/i.test(key)) throw new ApiError('server', 'invalid id format');
      if (!saved.some(item => item.id === key)) throw new ApiError('server', 'saved query not found');
      saved = saved.filter(item => item.id !== key); return one({ success: true });
    }
    if (type === 'short_link_create' || type === 'share_link_create') {
      const queryString = validQuery(data.query), shortId = id('link');
      // No demo redirect server: returned URLs carry the full query and stay on this app.
      const route = new URLSearchParams(queryString).get('dataset') === 'private' ? '/private/search' : '/search';
      const url = new URL(route, origin()); url.search = queryString;
      if (type === 'short_link_create') { shortLinks.set(shortId, url.toString()); return one({ short_id: shortId, short_url: url.toString() }); }
      if (!data.data || typeof data.data !== 'object' || Array.isArray(data.data)) throw new ApiError('server', 'data (search payload) is required');
      const ttl = data.ttl_seconds === undefined ? 604800 : Number(data.ttl_seconds), uses = data.max_opens === undefined ? 10 : Number(data.max_opens);
      if (!Number.isSafeInteger(ttl) || ttl < 1 || !Number.isSafeInteger(uses) || uses < 1) throw new ApiError('server', 'ttl_seconds and max_opens must be positive integers');
      const token = id('share'); shares.set(token, { data: canonical(withoutToken(object(data.data))), expires: now() + ttl, remaining: uses, owner });
      url.searchParams.set('st', token); shortLinks.set(shortId, url.toString());
      return one({ short_id: shortId, short_url: url.toString(), long_url: url.toString(), share_token: token });
    }
    if (type === 'private_tasks_get') return one(tasks);
    if (type === 'private_planning_tasks_get') return one(planned);
    if (type === 'private_task_add') {
      const input = taskInput(data);
      if ((profile.scan_credits ?? 0) < input.cost) throw new ApiError('server', 'Not enough scan credits');
      const taskId = id('scan'); profile.scan_credits = (profile.scan_credits ?? 0) - input.cost;
      tasks.unshift({ id: taskId, status: 'queued', created_at: now(), start_time: 0, end_time: 0, done_task_count: 0, task_count: input.cost, result_count: 0, has_results: false, host_list: input.host_list, cidr_list: input.cidr_list, port_list: input.port_list, schedule: input.schedule });
      if (input.schedule) planned.unshift({ id: taskId, user_name: profile.user_name, workers: 500, host_list: input.host_list, cidr_list: input.cidr_list, port_list: input.port_list, schedule: input.schedule });
      return { frames: [result({ task_id: taskId, message: 'Task queued.' }), result(tasks, 'private_tasks_get')] };
    }
    if (type === 'private_task_update') {
      const taskId = requiredString(data, 'id', 'Task ID is required'), task = tasks.find(item => item.id === taskId) ?? planned.find(item => item.id === taskId);
      if (!task) throw new ApiError('server', 'Task not found');
      const input = taskInput({ ...task, ...data });
      Object.assign(task, { schedule: input.schedule, host_list: input.host_list, cidr_list: input.cidr_list, port_list: input.port_list });
      const plan = planned.find(item => item.id === taskId);
      if (plan) Object.assign(plan, { schedule: input.schedule, host_list: input.host_list, cidr_list: input.cidr_list, port_list: input.port_list });
      return one({ message: 'updated' });
    }
    if (type === 'private_task_remove' || type === 'private_planning_task_remove') {
      const taskId = requiredString(data, 'id'), fromPlan = type === 'private_planning_task_remove', values = fromPlan ? planned : tasks;
      if (!values.some(item => item.id === taskId)) throw new ApiError('server', 'Task not found');
      if (fromPlan) planned = planned.filter(item => item.id !== taskId); else tasks = tasks.filter(item => item.id !== taskId);
      return { frames: [result({ message: 'removed' }), result(fromPlan ? planned : tasks, fromPlan ? 'private_planning_tasks_get' : 'private_tasks_get')] };
    }
    if (type === 'private_task_results_delete') {
      const taskIds = stringArray(data.task_ids); if (!taskIds.length) throw new ApiError('server', 'task_ids is required and must not be empty');
      for (const taskId of taskIds) { deletedResults.add(taskId); const task = tasks.find(item => item.id === taskId); if (task) { task.result_count = 0; task.has_results = false; } }
      return one({ message: 'deleted' });
    }
    if (type === 'get_pricing_info') return one(pricing);
    if (type === 'networks') return one([{ network: 'demo-network', coins: [{ coin: 'DEMO', name: 'Demo token — no real payment', price: 1, addresses: [] }] }]);
    if (type === 'validate_promo_code') {
      const amount = purchase(data), valid = text(data.promo_code).toUpperCase() === 'WELCOME';
      return one({ valid, promo_code: text(data.promo_code), description: valid ? '10% discount' : 'Promo code not recognized', discount_pct: valid ? 10 : 0, original_amount_usd: amount.amount, final_amount_usd: valid ? amount.final : amount.amount, timestamp: now() });
    }
    if (type === 'init_checkout' || type === 'billing_manage') throw new ApiError('server', 'Payment service unavailable. Please try again later.', { outcome: 'not-sent' });
    if (type === 'pay_with_balance') {
      if ([...purchaseOrders.entries()].some(([paymentId, order]) => order.owner === owner && order.detail.method !== 'balance' && order.detail.authorized && purchaseDetail(paymentId)?.status === 'pending')) throw new ApiError('server', 'Check your current payment before starting another purchase.', { outcome: 'not-sent' });
      const amount = purchase(data), issuedAt = now(), expiresAt = issuedAt + 3600;
      const reserved = [...walletOrders.entries()].reduce((total, [paymentId, order]) => total + (order.owner === owner && order.status === 'pending' && (payments.find(item => item.payment_id === paymentId)?.expires_at ?? 0) > issuedAt ? order.amount : 0), 0);
      if ((owner.balance ?? 0) - reserved < amount.final) throw new ApiError('server', reserved ? 'Part of your balance is reserved for a pending payment. Check it before starting another purchase.' : 'Insufficient balance', { outcome: 'not-sent' });
      const paymentId = id('pay');
      walletOrders.set(paymentId, { owner, request: clone(data), amount: amount.final, status: 'pending' });
      payments.unshift({ payment_id: paymentId, subscription: amount.plan?.type ?? amount.pack?.name ?? 'Search credits', amount: amount.final, amount_usd: amount.final, status: 'pending', created_at: issuedAt, updated_at: issuedAt, expires_at: expiresAt });
      purchaseOrders.set(paymentId, { owner, request: clone(data), detail: { paymentId, method: 'balance', status: 'pending', product: amount.plan?.name ?? amount.plan?.type ?? amount.pack?.name ?? 'Search credits', kind: amount.plan ? 'plan' : 'credits', credits: amount.pack?.tokens, cadence: amount.plan ? data.cadence as 'monthly' | 'annually' : undefined, subtotal: amount.amount, discount: amount.amount - amount.final, total: amount.final, currency: 'USD', promoCode: text(data.promo_code) || undefined, createdAt: issuedAt, updatedAt: issuedAt, expiresAt, authorized: true, request: { ...(amount.plan ? { subscription: amount.plan.type, cadence: data.cadence as 'monthly' | 'annually' } : { token_pack_id: amount.pack!.id }), ...(text(data.promo_code) ? { promo_code: text(data.promo_code) } : {}) } } });
      savePresentationOrders();
      return one({ payment_id: paymentId, amount: amount.final, amount_usd: amount.final, original_amount_usd: amount.amount, final_amount_usd: amount.final, expires_at: expiresAt, timestamp: issuedAt, message: 'Your wallet payment is ready for confirmation.' });
    }
    if (type === 'get_address') {
      const amount = purchase(data);
      if (data.network !== 'demo-network' || data.coin !== 'DEMO') throw new ApiError('server', 'Cryptocurrency payments are unavailable.');
      const paymentId = id('pay'), address = 'DEMO_ONLY_NOT_A_PAYMENT_ADDRESS', issuedAt = now(), expiresAt = issuedAt + 3600;
      // Non-payable cryptocurrency placeholders never settle or grant access.
      payments.unshift({ payment_id: paymentId, subscription: text(data.subscription), amount: amount.final, amount_usd: amount.final, address, network: 'demo-network', coin: 'DEMO', status: 'pending', created_at: issuedAt, updated_at: issuedAt, expires_at: expiresAt });
      return one({ payment_id: paymentId, network: 'demo-network', coin: 'DEMO', address, amount: amount.final, amount_usd: amount.final, original_amount_usd: amount.amount, final_amount_usd: amount.final, expires_at: expiresAt, timestamp: issuedAt, message: 'Demo invoice only. Do not send money. Payment remains pending; access and balance are unchanged.' });
    }
    if (type === 'confirm_payment') {
      const paymentId = requiredString(data, 'payment_id'), payment = payments.find(item => item.payment_id === paymentId);
      if (!payment) throw new ApiError('server', 'Payment not found');
      const order = walletOrders.get(paymentId);
      if (order) {
        if (order.owner !== owner) throw new ApiError('auth', 'This payment belongs to another account');
        if (order.status !== 'pending') return one(settleWallet(paymentId));
        const pending = result({ payment_id: paymentId, status: 'pending', message: 'Confirming payment from your account wallet.', timestamp: now() });
        return { frames: [pending, pending], intervalMs: delay === 0 ? 0 : 850, beforeDelivery: (frame, index) => index === 1 ? result(settleWallet(paymentId)) : frame };
      }
      const presented = purchaseOrders.get(paymentId);
      if (presented) {
        if (presented.owner !== owner) throw new ApiError('auth', 'This payment belongs to another account');
        if (payment.status !== 'pending' || presented.detail.expiresAt <= now()) return one(settlePresentation(paymentId));
        if (presented.detail.authorized) {
          const pending = result({ payment_id: paymentId, status: 'pending', message: 'Confirming your payment.', timestamp: now() });
          return { frames: [pending, pending], intervalMs: delay === 0 ? 0 : 650, beforeDelivery: (frame, index) => index === 1 ? result(settlePresentation(paymentId)) : frame };
        }
      }
      return { frames: [result({ payment_id: paymentId, status: 'pending', message: 'Payment is pending. Access updates after confirmation.', timestamp: now() })], persistent: true };
    }
    if (type === 'delete_payment') {
      const paymentId = requiredString(data, 'payment_id', 'Missing payment_id');
      if (!payments.some(item => item.payment_id === paymentId)) throw new ApiError('server', 'Payment not found');
      const order = walletOrders.get(paymentId);
      if (order && order.owner !== owner || purchaseOrders.has(paymentId) && purchaseOrders.get(paymentId)!.owner !== owner) throw new ApiError('auth', 'This payment belongs to another account');
      if (order?.status === 'pending') order.status = 'canceled';
      const presented = purchaseOrders.get(paymentId); if (presented?.detail.status === 'pending') presented.detail.status = 'canceled';
      payments = payments.filter(item => item.payment_id !== paymentId); deletedPaymentCount++;
      savePresentationOrders();
      return one({ payment_id: paymentId, status: 'moved_to_deleted', payments_count: payments.length, deleted_count: deletedPaymentCount, timestamp: now() });
    }
    if (type === 'user_billing') return one({ user_id: profile.user_id, addresses: profile.addresses ?? [], payments: payments.filter(item => !purchaseOrders.has(item.payment_id) || purchaseOrders.get(item.payment_id)!.owner === owner), subscription: { ...profile.subscription, name: profile.subscription?.type, days_remaining: Math.max(0, Math.ceil(((profile.subscription?.expiry_date ?? now()) - now()) / 86400)), active: (profile.subscription?.expiry_date ?? Infinity) > now() }, balance: profile.balance, credits: profile.credits, scan_credits: profile.scan_credits, timestamp: now() });
    if (type === 'get_user_addresses_info') return one({ user_id: profile.user_id, addresses: seedTrackedAddresses(seedEpoch).filter(address => profile.addresses?.some(owned => owned.address === address.address)), timestamp: now() });
    if (type === 'get_address_transactions') {
      const address = requiredString(data, 'address');
      const transactions = address === DEMO_PAYMENT_ADDRESS && profile.addresses?.some(owned => owned.address === address) ? seedAddressTransactions(seedEpoch) : [];
      return one({ address, transactions, count: transactions.length, timestamp: now() });
    }
    if (type === 'cancel_subscription' || type === 'resume_subscription') {
      if (!profile.subscription) throw new ApiError('server', 'No subscription found');
      profile.subscription.canceled = type === 'cancel_subscription';
      if (profile.subscription.canceled) profile.subscription.canceled_at = now(); else delete profile.subscription.canceled_at;
      notify(profile.subscription.canceled ? 'subscription_canceled' : 'subscription_resumed', 'Subscription renewal updated. Your current access remains active until expiry.');
      return one({ status: profile.subscription.canceled ? 'canceled' : 'resumed', subscription: profile.subscription, message: 'Subscription renewal updated.', timestamp: now() });
    }
    if (type === 'get_notifications') return one(notificationData(false, Math.min(100, Math.max(1, Number(data.limit) || 20)), Math.max(0, Number(data.offset) || 0)));
    if (type === 'unread_notifications') return one(notificationData(true, 10));
    if (type === 'mark_notification_read') {
      const notificationId = requiredString(data, 'id', 'Missing notification ID'), item = notifications.find(item => item.id === notificationId);
      if (!item) throw new ApiError('server', 'Notification not found'); item.is_read = true; pushNotifications(); return one({ id: notificationId, status: 'marked_as_read' });
    }
    if (type === 'mark_all_notifications_read') { notifications.forEach(item => { item.is_read = true; }); pushNotifications(); return one({ status: 'all_marked_as_read' }); }
    if (type === 'regenerate_api_key') {
      profile.api_key = `00000000-0000-4000-8000-${String(++keyVersion).padStart(12, '0')}`;
      notifications.unshift({ id: id('notification'), notification_type: 'balance_increased', message: 'API key rotated.', payload: { event: 'api_key_regenerated', api_key: profile.api_key }, is_read: false, created_at: now() });
      pushNotifications(); return one({ api_key: profile.api_key, timestamp: now(), message: 'API key regenerated successfully' });
    }
    if (type === 'org_add' || type === 'org_remove') {
      const memberId = requiredString(data, 'user_id');
      if (profile.team?.is_team_member) throw new ApiError('server', 'Only the team owner can manage members');
      if (memberId === profile.user_id) throw new ApiError('server', 'Cannot add or remove the team owner');
      if (memberId.toLowerCase().includes('missing')) throw new ApiError('server', 'User not found');
      if (memberId.toLowerCase().includes('other-team')) throw new ApiError('server', 'User is already a member of another team');
      profile.team ??= { team_owner_id: profile.user_id, team_owner_name: profile.user_name, team_owner_email: profile.email, team_members: [] };
      profile.team.team_members ??= [];
      if (type === 'org_add') {
        if (profile.team.team_members.some(member => member.user_id === memberId)) throw new ApiError('server', 'User is already a member of this team');
        profile.team.team_members.push({ user_id: memberId, user_name: memberId, email: `${encodeURIComponent(memberId)}@example.com`, added_at: now() }); notify('team_member_added', `${memberId} joined the organization.`);
      } else {
        if (!profile.team.team_members.some(member => member.user_id === memberId)) throw new ApiError('server', 'User is not a member of this team');
        profile.team.team_members = profile.team.team_members.filter(member => member.user_id !== memberId);
      }
      return one({ message: type === 'org_add' ? 'team member added successfully' : 'Member removed from team' });
    }
    if (type === 'org_leave') {
      if (!profile.team?.is_team_member) throw new ApiError('server', 'Team owner cannot leave their own team');
      delete profile.team; return one({ message: 'Successfully left the team' });
    }
    if (type === 'user_sessions') return one(sessionData());
    if (type === 'session_limits') { const list = sessionData(); return one({ max_sessions: list.limit, current_sessions: list.total, can_create_new: list.total < list.limit, subscription: profile.subscription?.type ?? 'Free' }); }
    if (type === 'terminate_user_session' || type === 'terminate_all_sessions') {
      const target = type === 'terminate_user_session' ? requiredString(data, 'session_id') : '', count = sessions.length;
      if (target) { const session = sessions.find(session => session.session_id === target); if (!session) throw new ApiError('server', 'Session not found'); if (session.is_current) throw new ApiError('server', 'Cannot terminate current session'); }
      sessions = sessions.filter(session => target ? session.session_id !== target : session.is_current);
      return { frames: [result({ message: target ? 'Session terminated successfully' : 'All sessions terminated successfully', success: true, ...(target ? { session_id: target } : { terminated_count: count - sessions.length }) }), result(sessionData(), 'user_sessions')] };
    }
    if (type === 'totp') {
      if (profile.totp_active) throw new ApiError('server', '2FA is already enabled');
      totpExpires = now() + 900;
      return one({ qr_code_url: `otpauth://totp/APCOSYS:${encodeURIComponent(profile.email ?? 'demo')}?secret=JBSWY3DPEHPK3PXP&issuer=APCOSYS`, secret_key: 'JBSWY3DPEHPK3PXP', account_name: profile.email, issuer: 'APCOSYS', message: 'Enter the six-digit code within 15 minutes.', warning: 'This fixture secret is public. Never use it for a real account.' });
    }
    if (type === 'totp_validate') {
      if (!totpExpires || totpExpires <= now()) throw new ApiError('server', 'No temporary 2FA key found or it has expired');
      if (text(data.totp_code) !== DEMO_CODE) throw new ApiError('server', 'Invalid 2FA code');
      profile.totp_active = true; totpExpires = 0; backupCodes = [...DEMO_BACKUP_CODES];
      return one({ is_valid: true, message: 'Two-factor authentication enabled. Save your backup codes.', backup_codes: backupCodes });
    }
    throw new ApiError('server', `This operation is currently unavailable.`, { outcome: 'not-sent' });
  }

  function download(path: string, input: HttpOptions): Response {
    requireSession(true);
    if (profile.subscription?.type !== 'Business') httpError(403, 'Business subscription required');
    if (new Headers(input.headers).has('Range')) throw new ApiError('server', 'Range checkpoint recovery requires the live backend and is not simulated.', { status: 501, outcome: 'not-sent' });
    const data = object(input.body), format = data.format ?? 'json', bucketExport = path === '/download/buckets/stream';
    if (format !== 'json' && format !== 'csv') httpError(400, "format must be 'json' or 'csv'");
    const mode = data.download_mode ?? (bucketExport ? 'files' : undefined);
    if (bucketExport ? !['files', 'hosts'].includes(text(mode)) : !['partial', 'full'].includes(text(mode))) httpError(400, bucketExport ? "download_mode must be 'files' or 'hosts'" : "download_mode must be 'partial' or 'full'");
    if (mode === 'full' && format === 'csv') httpError(400, 'csv is not supported for full download mode');
    const maximum = data.max_documents === undefined ? 10000 : Number(data.max_documents), cap = mode === 'full' || mode === 'hosts' ? 10000 : 1000000;
    if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > cap) httpError(400, `max_documents must be between 1 and ${cap}`);
    let records: unknown[];
    if (bucketExport) {
      const values = matchingBuckets(buckets, data as BucketDownloadRequest);
      if (mode === 'hosts') { const hosts = new Map(values.map(value => [`${value.host}/${value.container ?? ''}`, { host: value.host, container: value.container }])); records = [...hosts.values()]; }
      else records = values;
    } else records = matchingHosts(hosts, data as SearchRequest, path.includes('/private/'), deletedResults).map(host => mode === 'full' ? host.detail : host.card);
    records = records.slice(0, maximum);
    const lines: string[] = [];
    if (format === 'json') lines.push(...records.map(record => JSON.stringify(record) + '\n'));
    else {
      const keys = [...new Set(records.flatMap(record => Object.keys(record as Data)))];
      const csv = (value: unknown) => `"${String(value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : value).replace(/"/g, '""')}"`;
      lines.push(keys.map(csv).join(',') + '\r\n', ...records.map(record => keys.map(key => csv((record as Data)[key])).join(',') + '\r\n'));
    }
    let index = 0;
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { if (input.signal?.aborted) { controller.error(new ApiError('transport', 'Download aborted.', { outcome: 'unknown' })); return; } if (index >= lines.length) { controller.close(); return; } controller.enqueue(new TextEncoder().encode(lines[index++])); } });
    return new Response(stream, { status: 200, headers: { 'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/x-ndjson', 'Content-Disposition': `attachment; filename="apcosys-export.${format === 'csv' ? 'csv' : 'ndjson'}"`, 'X-APCOSYS': 'true' } });
  }

  // Rebuild from the initial account exactly once. Never add the ledger to an
  // already-restored profile, and never trust stored prices or entitlement sizes.
  if (restoredOrders) {
    try {
      const restored = restoredOrders.orders.map(item => {
        const amount = purchase(object(item.request));
        if (item.method === 'crypto' && !PRESENTATION_NETWORKS.some(network => network.network === item.request.network && network.coins.some(coin => coin.coin === item.request.coin))) throw new Error('Unavailable stored network');
        if (item.method === 'crypto') { const quote = presentationCryptoQuote(amount.final, item.request.coin!); if (quote.cryptoAmount !== item.cryptoAmount || quote.quoteUsd !== item.quoteUsd) throw new Error('Invalid stored quote'); }
        if (item.status === 'completed' && item.completedAt! >= item.expiresAt) throw new Error('Invalid stored completion');
        return { item, amount };
      });
      payments = payments.filter(payment => !purchaseOrders.has(payment.payment_id));
      purchaseOrders.clear();
      for (const { item, amount } of restored) {
        const detail: PresentationOrder = { paymentId: item.paymentId, method: item.method, status: item.status, product: amount.plan?.name ?? amount.plan?.type ?? amount.pack!.name ?? 'Search credits', kind: amount.plan ? 'plan' : 'credits', credits: amount.pack?.tokens, cadence: amount.plan ? item.request.cadence : undefined, subtotal: amount.amount, discount: Math.round((amount.amount - amount.final) * 100) / 100, total: amount.final, currency: 'USD', promoCode: amount.final < amount.amount ? item.request.promo_code : undefined, createdAt: item.createdAt, updatedAt: item.updatedAt, expiresAt: item.expiresAt, completedAt: item.completedAt, authorized: item.authorized, request: { ...(amount.plan ? { subscription: amount.plan.type, cadence: item.request.cadence } : { token_pack_id: amount.pack!.id }), ...(item.request.promo_code ? { promo_code: item.request.promo_code } : {}) }, ...(item.method === 'crypto' ? { network: item.request.network, coin: item.request.coin, cryptoAmount: item.cryptoAmount, quoteUsd: item.quoteUsd, reference: item.paymentId === 'pay_001' ? 'APCO-PAY-001' : `APCO-ORDER-${item.paymentId.toUpperCase()}` } : {}) };
        purchaseOrders.set(item.paymentId, { owner: fixtureOwner, request: clone(item.request) as Data, detail });
        if (item.settlementSequence !== undefined) { settlementSequences.set(item.paymentId, item.settlementSequence); nextSettlementSequence = Math.max(nextSettlementSequence, item.settlementSequence); }
        if (item.method === 'balance') walletOrders.set(item.paymentId, { owner: fixtureOwner, request: clone(item.request) as Data, amount: amount.final, status: item.status });
        if (!item.removed) payments.push({ payment_id: item.paymentId, subscription: detail.product, amount: item.method === 'crypto' ? Number(detail.cryptoAmount) : amount.final, amount_usd: amount.final, status: item.status, created_at: item.createdAt, updated_at: item.updatedAt, expires_at: item.expiresAt, completed_at: item.completedAt, ...(item.method === 'crypto' ? { network: detail.network, coin: detail.coin } : {}) });
        if (item.paymentId.startsWith('pay-')) sequence = Math.max(sequence, Number(item.paymentId.slice(4)));
      }
      for (const { item, amount } of restored.filter(value => value.item.status === 'completed').sort((a, b) => a.item.settlementSequence! - b.item.settlementSequence!)) {
        if (item.method === 'balance') fixtureOwner.balance = Math.round(((fixtureOwner.balance ?? 0) - amount.final) * 100) / 100;
        grantPurchase(fixtureOwner, item.request as Data, item.paymentId, amount.final, item.completedAt!);
      }
      payments.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
    } catch { try { orderStorage?.removeItem(PRESENTATION_ORDER_KEY); } catch { /* Invalid local history never reaches the live API. */ } }
  }

  const api: ApiClient = {
    url(path) { const url = new URL(path, origin()); if (url.origin !== origin()) throw new ApiError('transport', 'External demo URLs are not allowed', { outcome: 'not-sent' }); return url.toString(); },
    async connect() { requireSession(); if (connection === 'open') return; status('connecting'); status('open'); queueMicrotask(() => { if (connection === 'open') pushNotifications(); }); },
    disconnect() { close(); },
    getConnectionStatus() { return connection; },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    subscribeConnection(listener) { connectionListeners.add(listener); listener(connection); return () => { connectionListeners.delete(listener); }; },
    async httpResponse<T>(path: string, input: HttpOptions = {}): Promise<HttpResponse<T>> {
      aborted(input.signal); const response = httpRoute(path, input);
      return { data: clone(response.data) as T, status: response.status, headers: new Headers({ 'Content-Type': 'application/json', 'X-APCOSYS': 'true' }) };
    },
    async http<T>(path: string, input?: HttpOptions): Promise<T> { return (await api.httpResponse<T>(path, input)).data; },
    async raw(path: string, input: HttpOptions = {}): Promise<Response> {
      aborted(input.signal);
      const url = new URL(path, origin());
      if (['/download/bulk/stream', '/download/private/bulk/stream', '/download/buckets/stream'].includes(url.pathname)) {
        if ((input.method ?? (input.body === undefined ? 'GET' : 'POST')).toUpperCase() !== 'POST') httpError(405, 'Method not allowed');
        return download(url.pathname, input);
      }
      if (url.pathname === '/s') { const target = shortLinks.get(url.searchParams.get('sid') ?? '') ?? `${origin()}/search`; return new Response(null, { status: 302, headers: { Location: target, 'X-APCOSYS': 'true' } }); }
      const response = await api.httpResponse(path, input); return new Response(JSON.stringify(response.data), { status: response.status, headers: response.headers });
    },
    async request<T>(type: string, data?: unknown, input: RequestOptions = {}): Promise<ApiFrame<T>> {
      aborted(input.signal); await api.connect(); aborted(input.signal);
      const requestId = id('demo-request'), prepared = frames(type, object(data), requestId);
      prepared.frames.forEach(emit);
      const response = prepared.frames.find(frame => (input.responseTypes ?? [type]).includes(frame.type));
      if (!response) throw new ApiError('server', `No supported ${type} response was returned`);
      return clone(response) as ApiFrame<T>;
    },
    stream<T>(type: string, data: unknown, input: StreamOptions<T>): () => void {
      let stopped = false, started = false;
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const cleanup = () => { if (stopped) return; stopped = true; timers.forEach(clearTimeout); timers.clear(); active.delete(stop); input.signal?.removeEventListener('abort', abort); };
      const stop = (reason?: ApiError) => { if (stopped) return; cleanup(); if (reason) input.onError?.(reason); };
      const abort = () => stop(new ApiError('transport', 'Request was aborted.', { outcome: started ? 'unknown' : 'not-sent' }));
      const later = (fn: () => void, wait: number) => { const timer = setTimeout(() => { timers.delete(timer); if (!stopped) fn(); }, wait); timers.add(timer); };
      active.add(stop);
      if (input.signal?.aborted) { queueMicrotask(abort); return () => stop(); }
      input.signal?.addEventListener('abort', abort, { once: true });
      void api.connect().then(() => {
        if (stopped) return;
        try {
          const prepared = frames(type, object(data), id('demo-request')); started = true;
          const accepted = input.responseTypes ?? getMethodDefinition(type)?.responseTypes ?? [type];
          prepared.frames.forEach((frame, index) => later(() => {
            try {
              const delivered = prepared.beforeDelivery?.(frame, index) ?? frame;
              emit(delivered);
              if (accepted.includes(delivered.type)) input.onFrame(clone(delivered) as ApiFrame<T>);
              if (index === prepared.frames.length - 1 && !prepared.persistent) { cleanup(); input.onComplete?.(); }
            } catch (error) { stop(asApiError(error)); }
          }, (prepared.intervalMs ?? delay) * (index + 1)));
          const timeout = input.timeoutMs ?? 60000;
          if (timeout > 0) later(() => stop(new ApiError(input.mutation ? 'unknown' : 'timeout', 'The response stream timed out.', { outcome: 'unknown', method: type })), timeout);
        } catch (error) { stop(asApiError(error)); }
      }).catch(error => stop(asApiError(error)));
      return () => stop();
    },
  };
  registerPresentationPayments(api, {
    networks: clone(PRESENTATION_NETWORKS),
    async create(method, request) {
      requireSession(true);
      if (method !== 'card' && method !== 'crypto') throw new ApiError('server', 'Choose a payment method.');
      if (method === 'crypto' && !PRESENTATION_NETWORKS.some(network => network.network === request.network && network.coins.some(coin => coin.coin === request.coin))) throw new ApiError('server', 'Choose an available network and coin.');
      const input = object(request), amount = purchase(input), issuedAt = now();
      for (const [paymentId, order] of purchaseOrders) {
        if (order.owner !== profile) continue;
        const existing = purchaseDetail(paymentId);
        if (existing?.status !== 'pending') continue;
        if (existing.method === method && canonical(order.request) === canonical(input)) return existing;
        if (existing.authorized) throw new ApiError('server', 'Check your current payment before starting another purchase.');
      }
      const paymentId = id('pay'), expiresAt = issuedAt + 3600;
      const detail: PresentationOrder = { paymentId, method, status: 'pending', product: amount.plan?.name ?? amount.plan?.type ?? amount.pack?.name ?? 'Search credits', kind: amount.plan ? 'plan' : 'credits', credits: amount.pack?.tokens, cadence: amount.plan ? request.cadence : undefined, subtotal: amount.amount, discount: Math.round((amount.amount - amount.final) * 100) / 100, total: amount.final, currency: 'USD', promoCode: amount.final < amount.amount ? text(request.promo_code) : undefined, createdAt: issuedAt, updatedAt: issuedAt, expiresAt, authorized: false,
        ...(method === 'crypto' ? { network: request.network, coin: request.coin, ...presentationCryptoQuote(amount.final, request.coin!), reference: `APCO-ORDER-${paymentId.toUpperCase()}` } : {}),
        request: { ...(amount.plan ? { subscription: amount.plan.type, cadence: request.cadence } : { token_pack_id: amount.pack!.id }), ...(text(request.promo_code) ? { promo_code: text(request.promo_code) } : {}) } };
      purchaseOrders.set(paymentId, { owner: profile, request: clone(input), detail });
      payments.unshift({ payment_id: paymentId, subscription: detail.product, amount: method === 'crypto' ? Number(detail.cryptoAmount) : amount.final, amount_usd: amount.final, status: 'pending', created_at: issuedAt, updated_at: issuedAt, expires_at: expiresAt, ...(method === 'crypto' ? { network: request.network, coin: request.coin } : {}) });
      savePresentationOrders();
      return clone(detail);
    },
    get: purchaseDetail,
    authorize(paymentId) {
      requireSession(true);
      const detail = purchaseDetail(paymentId);
      if (!detail) throw new ApiError('server', 'This order could not be found.');
      if (detail.status !== 'pending') return detail;
      if (detail.method === 'balance') throw new ApiError('server', 'Check this wallet payment from Payments.');
      if ([...purchaseOrders.entries()].some(([otherId, order]) => otherId !== paymentId && order.owner === profile && order.detail.authorized && purchaseDetail(otherId)?.status === 'pending')) throw new ApiError('server', 'Check your current payment before confirming another order.');
      purchaseOrders.get(paymentId)!.detail.authorized = true;
      savePresentationOrders();
      return purchaseDetail(paymentId)!;
    },
    cancel(paymentId) {
      requireSession(true);
      const detail = purchaseDetail(paymentId);
      if (!detail) throw new ApiError('server', 'This order could not be found.');
      if (detail.status !== 'pending') return detail;
      if (detail.authorized) throw new ApiError('server', 'Confirmation has started. Check the payment status before continuing.');
      const payment = payments.find(item => item.payment_id === paymentId)!;
      payment.status = 'canceled'; payment.updated_at = now();
      savePresentationOrders();
      return purchaseDetail(paymentId)!;
    },
    addresses() {
      requireSession(true);
      return { user_id: profile.user_id, timestamp: now(), addresses: profile === fixtureOwner ? [
        { network: 'Ethereum', coin: 'USDT', address: 'APCO-ACCOUNT-ETH-01', is_active: true, total_received: '150000000', total_received_readable: '150.000000', last_checked_at: seedEpoch, last_tx_timestamp: seedEpoch - 86400 * 2 },
        { network: 'Ethereum', coin: 'ETH', address: 'APCO-ACCOUNT-ETH-02', is_active: true, total_received: '120000000000000000', total_received_readable: '0.120000000000000000', last_checked_at: seedEpoch, last_tx_timestamp: seedEpoch - 86400 * 6 },
      ] : [] };
    },
    transactions(reference) {
      requireSession(true);
      const tether = reference === 'APCO-ACCOUNT-ETH-01', eth = reference === 'APCO-ACCOUNT-ETH-02';
      const offset = tether ? 86400 * 2 : 86400 * 6;
      return { address: reference, timestamp: now(), count: profile === fixtureOwner && (tether || eth) ? 1 : 0, transactions: profile === fixtureOwner && (tether || eth) ? [{ tx_hash: tether ? 'APCO-TRANSFER-ETH-001' : 'APCO-TRANSFER-ETH-002', from_address: 'APCO-EXTERNAL-ACCOUNT', amount: tether ? '150000000' : '120000000000000000', decimals: tether ? 6 : 18, block_number: tether ? '21500481' : '21483102', timestamp: seedEpoch - offset, status: 'processed', created_at: seedEpoch - offset + 8, processed_at: seedEpoch - offset + 120 }] : [] };
    },
  });
  return api;
}

