import {
  PROTOCOL_VERSION,
  type HostEvent,
  type RpcErrorPayload,
  type RpcMethod,
  type RpcParams,
  type RpcResult,
  type WebviewMessage,
} from '@shared/protocol';
import { listenToHost, postToHost } from './vscodeApi';

const DEFAULT_TIMEOUT_MS = 30000;
const TIMEOUT_CODE = 'timeout';

export interface RpcTransport {
  post(message: WebviewMessage): void;
  listen(handler: (message: unknown) => void): void;
}

export class RpcError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}

interface PendingCall {
  readonly resolve: (result: unknown) => void;
  readonly reject: (error: RpcError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class RpcClient {
  private readonly pending = new Map<number, PendingCall>();
  private readonly listeners = new Set<(event: HostEvent) => void>();
  private nextId = 1;
  private isListening = false;

  constructor(private readonly transport: RpcTransport) {}

  call<M extends RpcMethod>(method: M, params: RpcParams<M>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RpcResult<M>> {
    this.ensureListening();
    const id = this.nextId++;
    return new Promise<RpcResult<M>>((resolve, reject) => {
      const timer = setTimeout(() => this.expire(id, method, timeoutMs), timeoutMs);
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject, timer });
      this.transport.post({ kind: 'request', id, method, params });
    });
  }

  onEvent(listener: (event: HostEvent) => void): () => void {
    this.ensureListening();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  ready(): void {
    this.ensureListening();
    this.transport.post({ kind: 'ready', protocol: PROTOCOL_VERSION });
  }

  private ensureListening(): void {
    if (!this.isListening) {
      this.isListening = true;
      this.transport.listen((message) => this.handleMessage(message));
    }
  }

  private handleMessage(message: unknown): void {
    if (!isRecord(message)) {
      return;
    }
    if (message.kind === 'response') {
      this.settle(message);
    } else if (message.kind === 'event') {
      this.listeners.forEach((listener) => listener(message as unknown as HostEvent));
    }
  }

  private settle(response: Record<string, unknown>): void {
    const call = typeof response.id === 'number' ? this.pending.get(response.id) : undefined;
    if (call === undefined) {
      return;
    }
    this.pending.delete(response.id as number);
    clearTimeout(call.timer);
    if (response.ok === true) {
      call.resolve(response.result);
    } else {
      const error = response.error as RpcErrorPayload;
      call.reject(new RpcError(error.code, error.message, error.status));
    }
  }

  private expire(id: number, method: string, timeoutMs: number): void {
    const call = this.pending.get(id);
    if (call !== undefined) {
      this.pending.delete(id);
      call.reject(new RpcError(TIMEOUT_CODE, `The extension did not answer "${method}" within ${timeoutMs / 1000} s.`, 0));
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const rpc = new RpcClient({ post: postToHost, listen: listenToHost });
