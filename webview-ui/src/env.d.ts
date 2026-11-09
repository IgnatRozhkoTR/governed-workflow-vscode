declare module '*.css';

interface VsCodeWebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState<T>(state: T): T;
}

declare function acquireVsCodeApi(): VsCodeWebviewApi;
