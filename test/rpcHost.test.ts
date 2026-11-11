import type { HostMessage, RpcMethod } from '@shared/protocol';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AuthRequiredError } from '../src/api/errors';
import { RpcHandlerError, RpcHost, toErrorPayload, type MessageSink, type RpcHandlers } from '../src/webview/rpcHost';

class RecordingSink implements MessageSink {
  readonly messages: HostMessage[] = [];

  async postMessage(message: HostMessage): Promise<boolean> {
    this.messages.push(message);
    return true;
  }
}

function handlers(overrides: Partial<RpcHandlers>): RpcHandlers {
  const unexpected = async (): Promise<never> => {
    throw new Error('unexpected call');
  };
  const methods: RpcMethod[] = [
    'api.request', 'i18n.load', 'workspace.snapshot', 'state.refresh', 'panel.rememberTab', 'native.openFile', 'native.openDiff',
    'native.openAllChanges', 'native.resumeClaude', 'native.showTerminal', 'native.startClaude', 'native.openWorktree',
    'native.switchWorkspace', 'native.copyText', 'native.openExternal', 'native.setToken', 'native.saveFile',
  ];
  return { ...Object.fromEntries(methods.map((method) => [method, unexpected])), ...overrides } as RpcHandlers;
}

let sink: RecordingSink;
let onReady: ReturnType<typeof vi.fn>;

beforeEach(() => {
  sink = new RecordingSink();
  onReady = vi.fn();
});

describe('RpcHost', () => {
  it('handleMessage_shouldRespondWithResult_whenHandlerSucceeds', async () => {
    const snapshot = { workspace: null, state: null, etag: null };
    const host = new RpcHost(sink, handlers({ 'workspace.snapshot': async () => snapshot }), onReady);

    await host.handleMessage({ kind: 'request', id: 7, method: 'workspace.snapshot', params: {} });

    expect(sink.messages).toEqual([{ kind: 'response', id: 7, ok: true, result: snapshot }]);
  });

  it('handleMessage_shouldPassParamsToHandler', async () => {
    const copy = vi.fn(async () => undefined);
    const host = new RpcHost(sink, handlers({ 'native.copyText': copy }), onReady);

    await host.handleMessage({ kind: 'request', id: 1, method: 'native.copyText', params: { text: 'hello' } });

    expect(copy).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('handleMessage_shouldRespondUnknownMethod_whenMethodIsNotRegistered', async () => {
    const host = new RpcHost(sink, handlers({}), onReady);

    await host.handleMessage({ kind: 'request', id: 3, method: 'toString', params: {} });

    expect(sink.messages).toEqual([{ kind: 'response', id: 3, ok: false, error: expect.objectContaining({ code: 'unknown_method' }) }]);
  });

  it('handleMessage_shouldRespondWithErrorPayload_whenHandlerThrows', async () => {
    const host = new RpcHost(sink, handlers({ 'state.refresh': async () => { throw new RpcHandlerError('no_workspace', 'none'); } }), onReady);

    await host.handleMessage({ kind: 'request', id: 4, method: 'state.refresh', params: {} });

    expect(sink.messages).toEqual([{ kind: 'response', id: 4, ok: false, error: { code: 'no_workspace', message: 'none', status: 0 } }]);
  });

  it('handleMessage_shouldCallOnReady_whenReadyMessageArrives', async () => {
    const host = new RpcHost(sink, handlers({}), onReady);

    await host.handleMessage({ kind: 'ready', protocol: 1 });

    expect(onReady).toHaveBeenCalledWith(1);
    expect(sink.messages).toEqual([]);
  });

  it('handleMessage_shouldIgnoreMalformedMessages', async () => {
    const host = new RpcHost(sink, handlers({}), onReady);

    await host.handleMessage({ kind: 'request', id: 'x', method: 'state.refresh', params: {} });
    await host.handleMessage(null);

    expect(sink.messages).toEqual([]);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('postEvent_shouldForwardEventToSink', () => {
    const host = new RpcHost(sink, handlers({}), onReady);

    host.postEvent({ kind: 'event', event: 'connection', payload: { status: 'ok' } });

    expect(sink.messages).toEqual([{ kind: 'event', event: 'connection', payload: { status: 'ok' } }]);
  });
});

describe('toErrorPayload', () => {
  it('toErrorPayload_shouldMapAuthRequired_whenAuthRequiredError', () => {
    expect(toErrorPayload(new AuthRequiredError())).toMatchObject({ code: 'auth_required' });
  });

  it('toErrorPayload_shouldKeepCodeAndStatus_whenApiError', () => {
    expect(toErrorPayload(new ApiError(409, 'conflict', 'Busy'))).toEqual({ code: 'conflict', message: 'Busy', status: 409 });
  });

  it('toErrorPayload_shouldUseInternalError_whenUnknownError', () => {
    expect(toErrorPayload(new TypeError('boom'))).toEqual({ code: 'internal_error', message: 'boom', status: 0 });
  });
});
