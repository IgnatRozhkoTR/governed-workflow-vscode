// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as toastHost from '../../webview-ui/src/components/ToastHost';
import { RpcError } from '../../webview-ui/src/rpc/rpcClient';
import { type Mutation, useMutation } from '../../webview-ui/src/store/hooks';
import { store } from '../../webview-ui/src/store/store';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mountFailingMutation(error: unknown): Mutation<[], void> {
  let mutation: Mutation<[], void> | undefined;
  const failing = (): Promise<void> => Promise.reject(error);
  function Probe(): null {
    mutation = useMutation(failing, { invalidates: ['criteria'] });
    return null;
  }
  render(<Probe />);
  if (mutation === undefined) {
    throw new Error('Probe did not render');
  }
  return mutation;
}

describe('useMutation', () => {
  it('run_shouldToastAndInvalidate_whenServerAnswers404', async () => {
    const invalidate = vi.spyOn(store, 'invalidate');
    const toastError = vi.spyOn(toastHost.toasts, 'error');
    const mutation = mountFailingMutation(new RpcError('not_found', 'Criterion not found', 404));
    await mutation.run();
    expect(toastError).toHaveBeenCalledOnce();
    expect(invalidate).toHaveBeenCalledWith('criteria');
  });

  it('run_shouldInvalidate_whenServerAnswers409', async () => {
    const invalidate = vi.spyOn(store, 'invalidate');
    const mutation = mountFailingMutation(new RpcError('conflict', 'Changed elsewhere', 409));
    await mutation.run();
    expect(invalidate).toHaveBeenCalledWith('criteria');
  });

  it('run_shouldNotInvalidate_whenServerAnswers500', async () => {
    const invalidate = vi.spyOn(store, 'invalidate');
    const mutation = mountFailingMutation(new RpcError('internal', 'Boom', 500));
    await mutation.run();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('run_shouldToastRefreshFailure_whenInvalidationThrows', async () => {
    vi.spyOn(store, 'invalidate').mockImplementation(() => {
      throw new Error('refresh failed');
    });
    const toastError = vi.spyOn(toastHost.toasts, 'error');
    const mutation = mountFailingMutation(new RpcError('not_found', 'Criterion not found', 404));
    await expect(mutation.run()).resolves.toBeUndefined();
    expect(toastError).toHaveBeenCalledTimes(2);
  });

  it('run_shouldStayStableAndUseLatestOptions_whenRerenderedWithNewInlineOptions', async () => {
    const invalidate = vi.spyOn(store, 'invalidate');
    const runs: Mutation<[], void>[] = [];
    const succeed = (): Promise<void> => Promise.resolve();
    function Probe({ topic }: { readonly topic: 'criteria' | 'comments' }): null {
      runs.push(useMutation(succeed, { invalidates: [topic] }));
      return null;
    }
    const { rerender } = render(<Probe topic="criteria" />);

    rerender(<Probe topic="comments" />);
    await runs[0].run();

    expect(runs[1].run).toBe(runs[0].run);
    expect(invalidate).toHaveBeenCalledWith('comments');
  });
});
