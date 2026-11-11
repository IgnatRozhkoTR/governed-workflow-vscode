import type { DiffMode, WorkspaceRef, WorkspaceState } from '../api/types';
import type { NavTarget, TabId, Topic } from './navigation';

export type { DiffMode };

export const PROTOCOL_VERSION = 1;

export type Locale = 'en' | 'ru';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
export type QueryValue = string | number | boolean | undefined;

export const LOCALES: readonly Locale[] = ['en', 'ru'];
export const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE'];

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

export interface ApiRequest {
  readonly method: HttpMethod;
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
  readonly ifNoneMatch?: string;
}
export interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
  readonly etag?: string;
}

export interface OpenFileArgs {
  readonly path: string;
  readonly line?: number;
  readonly endLine?: number;
  readonly repo?: string;
  readonly absolute?: boolean;
}
export type ChangeKind = 'added' | 'deleted' | 'renamed' | 'modified';
export interface DiffSource {
  readonly mode: DiffMode;
  readonly base?: string;
  readonly commit?: string;
  readonly repo?: string;
}
export interface DiffFileRef { readonly path: string; readonly oldPath?: string | null; readonly kind: ChangeKind; }
export interface OpenDiffArgs { readonly source: DiffSource; readonly file: DiffFileRef; }
export interface OpenAllChangesArgs { readonly source: DiffSource; readonly files: readonly DiffFileRef[]; }
export interface StartClaudeArgs { readonly confirmed: boolean; }
export interface SaveFileArgs { readonly suggestedName: string; readonly content: string; }
export interface SaveFileResult { readonly saved: boolean; }

export interface RpcMethodMap {
  'api.request':          { params: ApiRequest;                 result: ApiResponse };
  'i18n.load':            { params: { locale: Locale };         result: Record<string, string> };
  'workspace.snapshot':   { params: Record<string, never>;      result: WorkspaceSnapshot };
  'state.refresh':        { params: Record<string, never>;      result: void };
  'panel.rememberTab':    { params: { tab: TabId };             result: void };
  'native.openFile':      { params: OpenFileArgs;               result: void };
  'native.openDiff':      { params: OpenDiffArgs;               result: void };
  'native.openAllChanges':{ params: OpenAllChangesArgs;         result: void };
  'native.resumeClaude':  { params: Record<string, never>;      result: void };
  'native.showTerminal':  { params: Record<string, never>;      result: void };
  'native.startClaude':   { params: StartClaudeArgs;            result: void };
  'native.openWorktree':  { params: Record<string, never>;      result: void };
  'native.switchWorkspace':{ params: Record<string, never>;     result: void };
  'native.revealCommentThread': { params: { commentId: number }; result: void };
  'native.copyText':      { params: { text: string };           result: void };
  'native.openExternal':  { params: { url: string };            result: void };
  'native.setToken':      { params: Record<string, never>;      result: void };
  'native.saveFile':      { params: SaveFileArgs;               result: SaveFileResult };
}
export type RpcMethod = keyof RpcMethodMap;
export type RpcParams<M extends RpcMethod> = RpcMethodMap[M]['params'];
export type RpcResult<M extends RpcMethod> = RpcMethodMap[M]['result'];

export interface RpcRequest<M extends RpcMethod = RpcMethod> {
  readonly kind: 'request'; readonly id: number; readonly method: M; readonly params: RpcParams<M>;
}
export interface RpcErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly status: number;
}
export type RpcResponse =
  | { readonly kind: 'response'; readonly id: number; readonly ok: true; readonly result: unknown }
  | { readonly kind: 'response'; readonly id: number; readonly ok: false; readonly error: RpcErrorPayload };

export interface WorkspaceSnapshot {
  readonly workspace: WorkspaceRef | null;
  readonly state: WorkspaceState | null;
  readonly etag: string | null;
}
export type ConnectionStatus =
  | { readonly status: 'ok' }
  | { readonly status: 'auth_required' }
  | { readonly status: 'error'; readonly message: string };

export type HostEvent =
  | { readonly kind: 'event'; readonly event: 'workspace';  readonly payload: WorkspaceSnapshot }
  | { readonly kind: 'event'; readonly event: 'state';      readonly payload: WorkspaceSnapshot }
  | { readonly kind: 'event'; readonly event: 'connection'; readonly payload: ConnectionStatus }
  | { readonly kind: 'event'; readonly event: 'navigate';   readonly payload: NavTarget }
  | { readonly kind: 'event'; readonly event: 'invalidate'; readonly payload: { readonly topics: readonly Topic[] } };

export type WebviewMessage = RpcRequest | { readonly kind: 'ready'; readonly protocol: number };
export type HostMessage = RpcResponse | HostEvent;

export interface PanelBootstrap {
  readonly protocol: number;
  readonly snapshot: WorkspaceSnapshot;
  readonly nav: NavTarget;
  readonly locale: Locale;
}
