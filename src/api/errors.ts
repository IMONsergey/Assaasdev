import type { ApiFrame } from './types';

export type ApiErrorKind = 'auth' | 'rate' | 'timeout' | 'unknown' | 'transport' | 'server';
export type OperationOutcome = 'not-sent' | 'rejected' | 'unknown';

export interface ApiErrorDetails {
  status?: number;
  requestId?: string;
  method?: string;
  retryAfterSeconds?: number;
  frame?: ApiFrame;
  cause?: unknown;
  outcome?: OperationOutcome;
}

/** kind is a client classification, never a fabricated server error code. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly requestId?: string;
  readonly method?: string;
  readonly retryAfterSeconds?: number;
  readonly frame?: ApiFrame;
  readonly outcome: OperationOutcome;
  override readonly cause?: unknown;

  constructor(kind: ApiErrorKind, message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = details.status;
    this.requestId = details.requestId;
    this.method = details.method;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.frame = details.frame;
    this.cause = details.cause;
    this.outcome = details.outcome ?? 'rejected';
  }
}

export function isApiError(value: unknown): value is ApiError { return value instanceof ApiError; }

export function classifyServerError(message: string, status?: number, frame?: ApiFrame): ApiErrorKind {
  const normalized = message.trim().toLowerCase();
  if (status === 429 || normalized.includes('too many requests') || normalized.includes('too many share') || normalized.startsWith('rate limit:')) return 'rate';
  if (status === 401 || frame?.metadata?.auth_required || normalized === 'unauthorized' || normalized === 'invalid session' || normalized.includes('session requires 2fa') || normalized.includes('invalid or expired session')) return 'auth';
  return 'server';
}
