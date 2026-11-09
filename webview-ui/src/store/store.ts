import type { ReviewComment, WorkspaceRef, WorkspaceState } from '@api-types';
import { DEFAULT_NAV, TOPICS, type NavTarget, type Topic } from '@shared/navigation';
import type { ConnectionStatus, HostEvent, Locale, PanelBootstrap, WorkspaceSnapshot } from '@shared/protocol';
import { openCount, rootsWithReplies } from '../lib/comments';
import { rpc } from '../rpc/rpcClient';
import { setPersisted } from '../rpc/vscodeApi';

export const NAV_PERSIST_KEY = 'nav';

export interface StoreSnapshot {
  readonly workspace: WorkspaceRef | null;
  readonly state: WorkspaceState | null;
  readonly etag: string | null;
  readonly stateVersion: number;
  readonly connection: ConnectionStatus;
  readonly locale: Locale;
  readonly nav: NavTarget;
  readonly versions: Readonly<Record<Topic, number>>;
}

const INITIAL_SNAPSHOT: StoreSnapshot = {
  workspace: null,
  state: null,
  etag: null,
  stateVersion: 0,
  connection: { status: 'ok' },
  locale: 'en',
  nav: DEFAULT_NAV,
  versions: Object.fromEntries(TOPICS.map((topic) => [topic, 0])) as Record<Topic, number>,
};

export class WorkspaceStore {
  private snapshot: StoreSnapshot = INITIAL_SNAPSHOT;
  private readonly listeners = new Set<() => void>();

  getSnapshot(): StoreSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(bootstrap: PanelBootstrap): void {
    this.update({ locale: bootstrap.locale });
    this.navigate(bootstrap.nav);
    this.applySnapshot(bootstrap.snapshot);
  }

  applyHostEvent(e: HostEvent): void {
    switch (e.event) {
      case 'workspace':
      case 'state':
        this.applySnapshot(e.payload);
        return;
      case 'connection':
        this.update({ connection: e.payload });
        return;
      case 'navigate':
        this.navigate(e.payload);
        return;
      case 'invalidate':
        this.invalidate(...e.payload.topics);
        return;
    }
  }

  invalidate(...topics: Topic[]): void {
    const versions = { ...this.snapshot.versions };
    topics.forEach((topic) => {
      versions[topic] += 1;
    });
    this.update({ versions });
  }

  navigate(nav: NavTarget): void {
    this.update({ nav });
    setPersisted(NAV_PERSIST_KEY, nav);
  }

  setLocale(locale: Locale): void {
    this.update({ locale });
  }

  async refreshState(): Promise<void> {
    await rpc.call('state.refresh', {});
  }

  private applySnapshot(snapshot: WorkspaceSnapshot): void {
    const isOtherWorkspace = !isSameWorkspace(this.snapshot.workspace, snapshot.workspace);
    this.update({
      workspace: snapshot.workspace,
      state: snapshot.state,
      etag: snapshot.etag,
      stateVersion: this.snapshot.stateVersion + 1,
    });
    // Topic data (comments, criteria, diffs...) belongs to the old workspace, so every resource must reload.
    if (isOtherWorkspace) {
      this.invalidate(...TOPICS);
    }
  }

  private update(patch: Partial<StoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}

const NO_COMMENTS: readonly ReviewComment[] = [];

// state.comments is grouped by `${scope}:${target}` on the server, so every badge and thread re-renders on each state event.
export function selectComments(s: StoreSnapshot, scope: string, target: string): readonly ReviewComment[] {
  return s.state === null ? NO_COMMENTS : rootsWithReplies(s.state, scope, target);
}

export function selectOpenCommentCount(s: StoreSnapshot, scope: string, target: string): number {
  return s.state === null ? 0 : openCount(s.state, scope, target);
}

function isSameWorkspace(left: WorkspaceRef | null, right: WorkspaceRef | null): boolean {
  return left?.projectId === right?.projectId && left?.branch === right?.branch;
}

export const store = new WorkspaceStore();
