import { PROTOCOL_VERSION, type HostEvent, type WebviewMessage } from '@shared/protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RpcClient, RpcError, type RpcTransport } from '../webview-ui/src/rpc/rpcClient';

class FakeTransport implements RpcTransport {
  readonly sent: WebviewMessage[] = [];
  private handler: ((message: unknown) => void) | undefined;

  post(message: WebviewMessage): void {
    this.sent.push(message);
  }

  listen(handler: (message: unknown) => void): void {
    this.handler = handler;
  }

  deliver(message: unknown): void {
    this.handler?.(message);
  }

  lastRequestId(): number {
    const last = this.sent.at(-1);
    if (last?.kind !== 'request') {
      throw new Error('No request was sent.');
    }
    return last.id;
  }
}

let transport: FakeTransport;
let client: RpcClient;

beforeEach(() => {
  transport = new FakeTransport();
  client = new RpcClient(transport);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RpcClient', () => {
  it('call_shouldResolveWithResult_whenHostRespondsOk', async () => {
    const pending = client.call('workspace.snapshot', {});
    transport.deliver({ kind: 'response', id: transport.lastRequestId(), ok: true, result: { workspace: null, state: null, etag: null } });

    await expect(pending).resolves.toEqual({ workspace: null, state: null, etag: null });
    expect(transport.sent[0]).toMatchObject({ kind: 'request', method: 'workspace.snapshot', params: {} });
  });

  it('call_shouldRejectWithRpcError_whenHostRespondsWithError', async () => {
    const pending = client.call('api.request', { method: 'GET', path: '/api/x' });
    transport.deliver({ kind: 'response', id: transport.lastRequestId(), ok: false, error: { code: 'forbidden_path', message: 'nope', status: 0 } });

    const error = await pending.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RpcError);
    expect(error).toMatchObject({ code: 'forbidden_path', message: 'nope', status: 0 });
  });

  it('call_shouldMatchResponsesById_whenAnsweredOutOfOrder', async () => {
    const first = client.call('state.refresh', {});
    const firstId = transport.lastRequestId();
    const second = client.call('workspace.snapshot', {});
    const secondId = transport.lastRequestId();

    transport.deliver({ kind: 'response', id: secondId, ok: true, result: 'second' });
    transport.deliver({ kind: 'response', id: firstId, ok: true, result: 'first' });

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
  });

  it('call_shouldRejectWithTimeout_whenHostNeverAnswers', async () => {
    vi.useFakeTimers();
    const pending = client.call('state.refresh', {}, 1000);
    const assertion = expect(pending).rejects.toMatchObject({ code: 'timeout' });

    vi.advanceTimersByTime(1000);

    await assertion;
  });

  it('call_shouldIgnoreLateResponse_whenAlreadyTimedOut', async () => {
    vi.useFakeTimers();
    const pending = client.call('state.refresh', {}, 10);
    const id = transport.lastRequestId();
    const assertion = expect(pending).rejects.toBeInstanceOf(RpcError);
    vi.advanceTimersByTime(10);
    await assertion;

    expect(() => transport.deliver({ kind: 'response', id, ok: true, result: undefined })).not.toThrow();
  });

  it('onEvent_shouldDeliverHostEvents_untilUnsubscribed', () => {
    const received: HostEvent[] = [];
    const unsubscribe = client.onEvent((event) => received.push(event));
    const event: HostEvent = { kind: 'event', event: 'invalidate', payload: { topics: ['comments'] } };

    transport.deliver(event);
    unsubscribe();
    transport.deliver(event);

    expect(received).toEqual([event]);
  });

  it('ready_shouldPostProtocolVersion', () => {
    client.ready();

    expect(transport.sent).toEqual([{ kind: 'ready', protocol: PROTOCOL_VERSION }]);
  });

  it('handleMessage_shouldIgnoreForeignMessages', () => {
    const listener = vi.fn();
    client.onEvent(listener);

    transport.deliver('not an object');
    transport.deliver({ kind: 'response', id: 999, ok: true, result: 1 });

    expect(listener).not.toHaveBeenCalled();
  });
});
