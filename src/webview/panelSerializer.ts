import type * as vscode from 'vscode';
import { DEFAULT_NAV, isNavTarget, type NavTarget } from '../shared/navigation';

export interface ControlPanelRestorer {
  restore(panel: vscode.WebviewPanel, nav: NavTarget): void;
}

export class ControlPanelSerializer implements vscode.WebviewPanelSerializer<unknown> {
  constructor(private readonly restorer: ControlPanelRestorer) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    this.restorer.restore(panel, savedNav(state));
  }
}

function savedNav(state: unknown): NavTarget {
  if (typeof state !== 'object' || state === null) {
    return DEFAULT_NAV;
  }
  const nav = (state as Record<string, unknown>).nav;
  return isNavTarget(nav) ? withoutOneShotIntents(nav) : DEFAULT_NAV;
}

// A restored window must not reopen a dialog or comment thread the user already dealt with before the reload.
function withoutOneShotIntents(nav: NavTarget): NavTarget {
  return { tab: nav.tab, section: nav.section, anchor: nav.anchor };
}
