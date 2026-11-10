import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';
import { DEFAULT_NAV, TAB_ORDER, type NavTarget, type TabId } from '../shared/navigation';

const KEY_PREFIX = 'governedWorkflow.lastTab:';

// Like the web's ui_last_tab:<project>/<branch>: a workspace reopens on the tab last picked there.
// A first visit lands on what needs the user (see needsAttentionNav), otherwise on DEFAULT_NAV (Progress).
export class LastTabMemory {
  constructor(private readonly memento: vscode.Memento) {}

  initialNav(ref: WorkspaceRef | undefined, attention: NavTarget | undefined): NavTarget {
    const tab = this.rememberedTab(ref);
    if (tab !== undefined) {
      return { tab };
    }
    return attention ?? DEFAULT_NAV;
  }

  rememberedTab(ref: WorkspaceRef | undefined): TabId | undefined {
    const tab = ref === undefined ? undefined : this.memento.get<unknown>(storageKey(ref));
    return isTabId(tab) ? tab : undefined;
  }

  remember(ref: WorkspaceRef, tab: TabId): Thenable<void> {
    return this.memento.update(storageKey(ref), tab);
  }
}

export function isTabId(value: unknown): value is TabId {
  return TAB_ORDER.includes(value as TabId);
}

function storageKey(ref: WorkspaceRef): string {
  return `${KEY_PREFIX}${ref.projectId}/${ref.branch}`;
}
