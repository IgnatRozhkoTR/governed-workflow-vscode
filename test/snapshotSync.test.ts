import type { WorkspaceSnapshot } from '@shared/protocol';
import { describe, expect, it, vi } from 'vitest';
import { pullSnapshotUntilLoaded } from '../webview-ui/src/store/snapshotSync';

const EMPTY: WorkspaceSnapshot = { workspace: { projectId: 'p', branch: 'b' }, state: null, etag: null };
const LOADED = { ...EMPTY, state: { phase: '1' }, etag: '"1"' } as unknown as WorkspaceSnapshot;

function setup(snapshots: Array<WorkspaceSnapshot | Error>) {
  let applied: WorkspaceSnapshot | undefined;
  const pull = vi.fn(async () => {
    const next = snapshots.shift() ?? LOADED;
    if (next instanceof Error) {
      throw next;
    }
    return next;
  });
  const wait = vi.fn(async () => undefined);
  const sync = {
    pull,
    apply: (snapshot: WorkspaceSnapshot) => { applied = snapshot; },
    isSettled: () => applied?.state !== null && applied !== undefined,
    retryDelaysMs: [10, 20, 30],
    wait,
  };
  return { sync, pull, wait };
}

describe('pullSnapshotUntilLoaded', () => {
  it('pullSnapshotUntilLoaded_shouldPullOnce_whenFirstSnapshotHasState', async () => {
    const { sync, pull, wait } = setup([LOADED]);

    await pullSnapshotUntilLoaded(sync);

    expect(pull).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it('pullSnapshotUntilLoaded_shouldRetryWithDelays_whenStateIsMissingOrPullFails', async () => {
    const { sync, pull, wait } = setup([EMPTY, new Error('lost'), LOADED]);

    await pullSnapshotUntilLoaded(sync);

    expect(pull).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[10], [20]]);
  });

  it('pullSnapshotUntilLoaded_shouldGiveUp_whenRetriesAreExhausted', async () => {
    const { sync, pull } = setup([EMPTY, EMPTY, EMPTY, EMPTY, EMPTY]);

    await pullSnapshotUntilLoaded(sync);

    expect(pull).toHaveBeenCalledTimes(4);
  });
});
