import type { WebviewMessage } from '@shared/protocol';

type PersistedState = Readonly<Record<string, unknown>>;

let vsCodeApi: VsCodeWebviewApi | undefined;

function api(): VsCodeWebviewApi {
  vsCodeApi ??= acquireVsCodeApi();
  return vsCodeApi;
}

export function postToHost(message: WebviewMessage): void {
  api().postMessage(message);
}

export function listenToHost(handler: (message: unknown) => void): void {
  window.addEventListener('message', (event: MessageEvent<unknown>) => handler(event.data));
}

export function getPersisted<T>(key: string): T | undefined {
  return persistedState()[key] as T | undefined;
}

export function setPersisted<T>(key: string, value: T): void {
  api().setState({ ...persistedState(), [key]: value });
}

function persistedState(): PersistedState {
  const state = api().getState();
  return typeof state === 'object' && state !== null ? (state as PersistedState) : {};
}
