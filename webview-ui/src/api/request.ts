import { projectPath, wsPath } from '@shared/paths';
import type { ApiRequest, HttpMethod, QueryValue } from '@shared/protocol';
import { rpc, RpcError } from '../rpc/rpcClient';
import { store } from '../store/store';

type Query = Record<string, QueryValue>;

export function apiGet<T>(path: string, query?: Query): Promise<T> {
  return send<T>('GET', path, { query });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return send<T>('POST', path, { body });
}

export function apiPut<T>(path: string, body?: unknown, query?: Query): Promise<T> {
  return send<T>('PUT', path, { body, query });
}

export function apiDelete<T>(path: string): Promise<T> {
  return send<T>('DELETE', path, {});
}

export function ws(suffix: string): string {
  return wsPath(requireWorkspace(), suffix);
}

export function project(suffix: string): string {
  return projectPath(requireWorkspace().projectId, suffix);
}

function requireWorkspace(): NonNullable<ReturnType<typeof store.getSnapshot>['workspace']> {
  const workspace = store.getSnapshot().workspace;
  if (workspace === null) {
    throw new RpcError('no_workspace', 'No workspace is selected.', 0);
  }
  return workspace;
}

async function send<T>(method: HttpMethod, path: string, extra: Pick<ApiRequest, 'query' | 'body'>): Promise<T> {
  const response = await rpc.call('api.request', { method, path, ...extra });
  return response.body as T;
}
