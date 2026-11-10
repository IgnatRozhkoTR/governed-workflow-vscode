import type { WorkspaceSnapshot } from '@shared/protocol';

export interface SnapshotSync {
  readonly pull: () => Promise<WorkspaceSnapshot>;
  readonly apply: (snapshot: WorkspaceSnapshot) => void;
  readonly isSettled: () => boolean;
  readonly retryDelaysMs: readonly number[];
  readonly wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// The host pushes snapshots as events, but an event posted before the webview attached its listener is lost, so the webview also pulls until it has state.
export async function pullSnapshotUntilLoaded(sync: SnapshotSync): Promise<void> {
  const wait = sync.wait ?? defaultWait;
  for (let attempt = 0; attempt <= sync.retryDelaysMs.length; attempt++) {
    if (attempt > 0) {
      await wait(sync.retryDelaysMs[attempt - 1] ?? 0);
      if (sync.isSettled()) {
        return;
      }
    }
    await pullOnce(sync);
    if (sync.isSettled()) {
      return;
    }
  }
}

async function pullOnce(sync: SnapshotSync): Promise<void> {
  try {
    sync.apply(await sync.pull());
  } catch {
    // The next attempt retries; the host also pushes the snapshot when it arrives.
  }
}
