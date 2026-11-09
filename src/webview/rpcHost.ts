import { ApiError, AuthRequiredError } from '../api/errors';
import type {
  HostEvent,
  HostMessage,
  RpcErrorPayload,
  RpcMethod,
  RpcParams,
  RpcRequest,
  RpcResult,
} from '../shared/protocol';

export type RpcHandler<M extends RpcMethod> = (params: RpcParams<M>) => Promise<RpcResult<M>>;
export type RpcHandlers = { readonly [M in RpcMethod]: RpcHandler<M> };

export interface MessageSink {
  postMessage(message: HostMessage): PromiseLike<boolean>;
}

export class RpcHandlerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'RpcHandlerError';
  }
}

const UNEXPECTED_ERROR_CODE = 'internal_error';
const AUTH_REQUIRED_CODE = 'auth_required';

export class RpcHost {
  constructor(
    private readonly sink: MessageSink,
    private readonly handlers: RpcHandlers,
    private readonly onReady: (protocol: number) => void,
  ) {}

  async handleMessage(message: unknown): Promise<void> {
    if (isReadyMessage(message)) {
      this.onReady(message.protocol);
      return;
    }
    if (isRequestMessage(message)) {
      await this.handleRequest(message);
    }
  }

  postEvent(event: HostEvent): void {
    void this.sink.postMessage(event);
  }

  private async handleRequest(request: RpcRequest): Promise<void> {
    const handler = this.handlerFor(request.method);
    if (handler === undefined) {
      this.postError(request.id, { code: 'unknown_method', message: `Unknown RPC method "${request.method}".`, status: 0 });
      return;
    }
    try {
      const result = await handler(request.params);
      await this.sink.postMessage({ kind: 'response', id: request.id, ok: true, result });
    } catch (error) {
      this.postError(request.id, toErrorPayload(error));
    }
  }

  private handlerFor(method: string): ((params: unknown) => Promise<unknown>) | undefined {
    if (!Object.hasOwn(this.handlers, method)) {
      return undefined;
    }
    return this.handlers[method as RpcMethod] as (params: unknown) => Promise<unknown>;
  }

  private postError(id: number, error: RpcErrorPayload): void {
    void this.sink.postMessage({ kind: 'response', id, ok: false, error });
  }
}

export function toErrorPayload(error: unknown): RpcErrorPayload {
  if (error instanceof AuthRequiredError) {
    return { code: AUTH_REQUIRED_CODE, message: error.message, status: error.status };
  }
  if (error instanceof ApiError || error instanceof RpcHandlerError) {
    return { code: error.code, message: error.message, status: error.status };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: UNEXPECTED_ERROR_CODE, message, status: 0 };
}

function isReadyMessage(message: unknown): message is { kind: 'ready'; protocol: number } {
  return isRecord(message) && message.kind === 'ready' && typeof message.protocol === 'number';
}

function isRequestMessage(message: unknown): message is RpcRequest {
  return isRecord(message)
    && message.kind === 'request'
    && Number.isInteger(message.id)
    && typeof message.method === 'string'
    && isRecord(message.params);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
