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

    expect(failed.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(poller.isRunning).toBe(true);
  });

  it('should retry quickly with backoff until the first state arrives', async () => {
    getState.mockRejectedValueOnce(new ApiError(0, 'network_error', 'down')).mockRejectedValueOnce(new ApiError(0, 'network_error', 'down')).mockResolvedValue(freshState('1'));
    const phases: string[] = [];
    poller.onDidChange((state) => phases.push(state.phase));

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    expect(getState).toHaveBeenCalledTimes(3);
    expect(phases).toEqual(['1']);
  });

  it('should return to the configured interval after first-load retries and never stack timers', async () => {
    getState.mockRejectedValueOnce(new ApiError(0, 'network_error', 'down')).mockResolvedValue(freshState('1'));
    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(500);
    expect(getState).toHaveBeenCalledTimes(2);

    void poller.refreshNow();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000 - 1);
    expect(getState).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000);

    expect(getState).toHaveBeenCalledTimes(5);
  });

  it('should fetch the first state even when the window is not focused', async () => {
    getState.mockResolvedValue(freshState('1'));
    setWindowFocus(false);
    const phases: string[] = [];
    poller.onDidChange((state) => phases.push(state.phase));

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(POLL_SECONDS * 1000 * 3);

    expect(phases).toEqual(['1']);
    expect(getState).toHaveBeenCalledTimes(1);
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
    expect(getState).toHaveBeenCalledTimes(1);

    setWindowFocus(true);
    await flush();

    expect(getState).toHaveBeenCalledTimes(2);
  });

  it('should poll every 3 seconds while the panel is visible and the window is focused', async () => {
    getState.mockResolvedValue(freshState('1'));
    poller.setPanelVisible(true);

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(3000);

    expect(getState).toHaveBeenCalledTimes(2);
  });

  it('should keep the configured interval while the panel is hidden', async () => {
    getState.mockResolvedValue(freshState('1'));

    poller.start();
    await flush();
    await vi.advanceTimersByTimeAsync(3000);

    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should switch to the fast interval when the panel becomes visible', async () => {
    getState.mockResolvedValue(freshState('1'));
    poller.start();
    await flush();

    poller.setPanelVisible(true);
    await vi.advanceTimersByTimeAsync(3000);

    expect(getState).toHaveBeenCalledTimes(2);
  });

  it('should return to the configured interval when the panel is hidden again', async () => {
    getState.mockResolvedValue(freshState('1'));
    poller.setPanelVisible(true);
    poller.start();
    await flush();

    poller.setPanelVisible(false);
    await vi.advanceTimersByTimeAsync(3000);

    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should not poll while the window is unfocused even if the panel is visible', async () => {
    getState.mockResolvedValue(freshState('1'));
    poller.setPanelVisible(true);
    poller.start();
    await flush();
    setWindowFocus(false);

    await vi.advanceTimersByTimeAsync(10000);
    poller.setPanelVisible(false);
    poller.setPanelVisible(true);
    await vi.advanceTimersByTimeAsync(10000);

    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('refreshNow_shouldNotApplyStaleResponse_whenRefreshRequestedDuringSlowFetch', async () => {
    const pending: ((result: StateFetchResult) => void)[] = [];
    getState.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const phases: string[] = [];
    poller.onDidChange((state) => phases.push(state.phase));

    const first = poller.refreshNow();
    const second = poller.refreshNow();
    expect(getState).toHaveBeenCalledOnce();
    pending[0](freshState('old'));
    await flush();
    expect(getState).toHaveBeenCalledTimes(2);
    pending[1](freshState('new'));
    await Promise.all([first, second]);

    expect(phases).toEqual(['old', 'new']);
    expect(poller.currentEtag).toBe('"new"');
    expect(getState).toHaveBeenLastCalledWith(WORKSPACE, '"old"');
  });

  it('refreshNow_shouldRunOnlyOneFollowUp_whenManyRefreshesRequestedDuringFetch', async () => {
    const pending: ((result: StateFetchResult) => void)[] = [];
    getState.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    const refreshes = [poller.refreshNow(), poller.refreshNow(), poller.refreshNow()];
    pending[0](freshState('1'));
    await flush();
    pending[1](freshState('2'));
    await Promise.all(refreshes);

    expect(getState).toHaveBeenCalledTimes(2);
  });
});
