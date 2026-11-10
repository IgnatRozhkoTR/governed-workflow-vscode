import type { ReviewComment, WorkspaceRef, WorkspaceState } from '@api-types';
import { DEFAULT_NAV, TOPICS, type NavTarget, type TabId, type Topic } from '@shared/navigation';
import { isLocale, type ConnectionStatus, type HostEvent, type Locale, type PanelBootstrap, type WorkspaceSnapshot } from '@shared/protocol';
import { normalizeWorkspaceState } from '@shared/normalizeState';
import { toasts } from '../components/ToastHost';
import { loadLocaleMessages } from '../i18n/i18n';
import { openCount, rootsWithReplies } from '../lib/comments';
import { rpc } from '../rpc/rpcClient';
import { setPersisted } from '../rpc/vscodeApi';
import { pullSnapshotUntilLoaded } from './snapshotSync';

export const NAV_PERSIST_KEY = 'nav';
const SNAPSHOT_RETRY_DELAYS_MS: readonly number[] = [300, 700, 1500, 3000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];

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
  private serverLocale: Locale | undefined;

  getSnapshot(): StoreSnapshot {
    return this.snapshot;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  initialize(bootstrap: PanelBootstrap): void {
    const workspaceLocale = bootstrap.snapshot.state?.locale;
    this.serverLocale = isLocale(workspaceLocale) ? workspaceLocale : undefined;
    this.update({ locale: this.serverLocale ?? bootstrap.locale });
    this.navigate(bootstrap.nav);
    this.applySnapshot(bootstrap.snapshot);
    this.changeLocale(this.snapshot.locale).catch(toasts.error);
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

  selectTab(tab: TabId): Promise<void> {
    this.navigate({ tab });
    return rpc.call('panel.rememberTab', { tab });
  }

  setLocale(locale: Locale): void {
    this.update({ locale });
  }

  // Messages load before the locale flips, so no render ever mixes the old locale with the new messages.
  async changeLocale(locale: Locale): Promise<void> {
    if (await loadLocaleMessages(locale)) {
      this.update({ locale });
    }
  }

  syncSnapshot(): Promise<void> {
    return pullSnapshotUntilLoaded({
      pull: () => rpc.call('workspace.snapshot', {}),
      apply: (snapshot) => this.applySnapshot(snapshot),
      isSettled: () => this.snapshot.state !== null || this.snapshot.workspace === null,
      retryDelaysMs: SNAPSHOT_RETRY_DELAYS_MS,
    });
  }

  async refreshState(): Promise<void> {
    await rpc.call('state.refresh', {});
  }

  applySnapshot(snapshot: WorkspaceSnapshot): void {
    const isOtherWorkspace = !isSameWorkspace(this.snapshot.workspace, snapshot.workspace);
    this.update({
      workspace: snapshot.workspace,
      state: snapshot.state === null ? null : normalizeWorkspaceState(snapshot.state),
      etag: snapshot.etag,
      stateVersion: this.snapshot.stateVersion + 1,
    });
    this.followServerLocale(snapshot.state?.locale);
    // Topic data (comments, criteria, diffs...) belongs to the old workspace, so every resource must reload.
    if (isOtherWorkspace) {
      this.invalidate(...TOPICS);
    }
  }

  // Only a change on the server is followed: a stale poll that still carries the old locale must not undo a pending user switch.
  private followServerLocale(locale: string | undefined): void {
    if (!isLocale(locale) || locale === this.serverLocale) {
      return;
    }
    this.serverLocale = locale;
    if (locale !== this.snapshot.locale) {
      this.changeLocale(locale).catch(toasts.error);
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
