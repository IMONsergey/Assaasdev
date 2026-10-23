export { createApiClient } from './client';
export { ApiError, isApiError } from './errors';
export type { ApiErrorKind, ApiErrorDetails, OperationOutcome } from './errors';
export type {
  ApiClient, ApiClientConfig, ApiFrame, ConnectionStatus, HttpOptions,
  HttpResponse, RequestOptions, StreamOptions, Unsubscribe, WebSocketLike,
} from './types';
export * from './contracts';
export { methodCatalog, unsupportedMethods, getMethodDefinition } from './catalog';
export type { MethodDefinition, CompletionRule } from './catalog';
