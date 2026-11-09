import type { ApiClient } from '../api/client';
import { HTTP_METHODS, type ApiRequest, type ApiResponse, type HttpMethod, type QueryValue } from '../shared/protocol';
import { RpcHandlerError } from './rpcHost';

const API_PATH_PATTERN = /^\/api\/[A-Za-z0-9._~%!'()*\-/]+$/;
const DOT_SEGMENTS = new Set(['.', '..']);
const FORBIDDEN_PATH_CODE = 'forbidden_path';

export type ApiRequester = Pick<ApiClient, 'request'>;

export function isAllowedApiPath(path: string): boolean {
  if (!API_PATH_PATTERN.test(path) || path.includes('//')) {
    return false;
  }
  return path.split('/').every((segment) => !isUnsafeSegment(segment));
}

export async function handleApiRequest(client: ApiRequester, request: ApiRequest): Promise<ApiResponse> {
  return client.request(validateApiRequest(request));
}

function validateApiRequest(request: ApiRequest): ApiRequest {
  if (!HTTP_METHODS.includes(request.method as HttpMethod)) {
    throw new RpcHandlerError(FORBIDDEN_PATH_CODE, `HTTP method "${String(request.method)}" is not allowed.`);
  }
  if (typeof request.path !== 'string' || !isAllowedApiPath(request.path)) {
    throw new RpcHandlerError(FORBIDDEN_PATH_CODE, `Path "${String(request.path)}" is outside the admin panel API.`);
  }
  if (request.query !== undefined && !isQueryRecord(request.query)) {
    throw new RpcHandlerError(FORBIDDEN_PATH_CODE, 'Query parameters must be strings, numbers or booleans.');
  }
  return request;
}

// URL parsing resolves percent-encoded dot segments too, so "/api/%2e%2e/x" must be rejected like "/api/../x";
// a segment that does not decode cannot be checked and is rejected as well.
function isUnsafeSegment(segment: string): boolean {
  try {
    return DOT_SEGMENTS.has(decodeURIComponent(segment));
  } catch {
    return true;
  }
}

function isQueryRecord(query: unknown): query is Readonly<Record<string, QueryValue>> {
  if (typeof query !== 'object' || query === null) {
    return false;
  }
  return Object.values(query).every(isQueryValue);
}

function isQueryValue(value: unknown): value is QueryValue {
  return value === undefined || ['string', 'number', 'boolean'].includes(typeof value);
}
