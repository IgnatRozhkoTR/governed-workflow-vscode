import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, AuthRequiredError } from '../src/api/errors';
import type { StateFetchResult, WorkspaceState } from '../src/api/types';
import type { ApiClient } from '../src/api/client';
import type { Settings } from '../src/config/settings';
import { StatePoller } from '../src/state/statePoller';
import { setWindowFocus } from './vscodeStub';

const WORKSPACE = { projectId: 'p', branch: 'feature/x' };
const POLL_SECONDS = 5;

const getState = vi.fn<(workspace: unknown, etag?: string) => Promise<StateFetchResult>>();
const client = { getState } as unknown as ApiClient;
const settings = { pollIntervalSeconds: POLL_SECONDS } as unknown as Settings;

function freshState(phase: string): StateFetchResult {
  return { notModified: false, state: { phase } as WorkspaceState, etag: `"${phase}"` };
}

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

let poller: StatePoller;

beforeEach(() => {
  vi.useFakeTimers();
  getState.mockReset();
  setWindowFocus(true);
  poller = new StatePoller(WORKSPACE, client, settings);
});

afterEach(() => {
  poller.dispose();
  vi.useRealTimers();
});

describe('StatePoller', () => {
  it('should fetch immediately and emit the state when started while focused', async () => {
    getState.mockResolvedValue(freshState('1'));
    const phases: string[] = [];
    poller.onDidChange((state) => phases.push(state.phase));

    poller.start();
    await flush();

    expect(poller.isRunning).toBe(true);
    expect(phases).toEqual(['1']);
  });

  it('should poll again after the configured interval when started', async () => {
    getState.mockResolvedValue(freshState('1'));

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000);

    expect(getState).toHaveBeenCalledTimes(2);
  });

  it('should send the previous etag and not emit when the server reports notModified', async () => {
    getState.mockResolvedValueOnce(freshState('1')).mockResolvedValue({ notModified: true });
    const emitted = vi.fn();
    poller.onDidChange(emitted);

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000);

    expect(getState).toHaveBeenLastCalledWith(WORKSPACE, '"1"');
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('should not fetch twice when start is called twice', async () => {
    getState.mockResolvedValue(freshState('1'));

    poller.start();
    poller.start();
    await flush();

    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should stop polling when stop is called', async () => {
    getState.mockResolvedValue(freshState('1'));
    poller.start();
    await flush();

    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000 * 3);

    expect(poller.isRunning).toBe(false);
    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should stop and fire onAuthRequired when the server responds 401', async () => {
    getState.mockRejectedValue(new AuthRequiredError('no'));
    const authRequired = vi.fn();
    poller.onAuthRequired(authRequired);

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000 * 3);

    expect(authRequired).toHaveBeenCalledTimes(1);
    expect(poller.isRunning).toBe(false);
    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should fire onDidFail and keep polling when the server responds with a non-auth error', async () => {
    getState.mockRejectedValue(new ApiError(500, 'boom', 'down'));
    const failed = vi.fn();
    poller.onDidFail(failed);

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000);

    expect(failed).toHaveBeenCalledTimes(2);
    expect(poller.isRunning).toBe(true);
  });

  it('should pause scheduled polls when the window loses focus', async () => {
    getState.mockResolvedValue(freshState('1'));
    poller.start();
    await flush();

    setWindowFocus(false);
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000 * 3);

    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should refresh when the window regains focus', async () => {
    getState.mockResolvedValue(freshState('1'));
    setWindowFocus(false);
    poller.start();
    await flush();
    expect(getState).not.toHaveBeenCalled();

    setWindowFocus(true);
    await flush();

    expect(getState).toHaveBeenCalledTimes(1);
  });
});
