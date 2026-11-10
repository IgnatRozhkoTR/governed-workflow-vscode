import type * as vscode from 'vscode';
import { isNavTarget, type NavTarget } from '../shared/navigation';

export interface ControlPanelRestorer {
  restore(panel: vscode.WebviewPanel, nav: NavTarget | undefined): void;
}

export class ControlPanelSerializer implements vscode.WebviewPanelSerializer<unknown> {
  constructor(private readonly restorer: ControlPanelRestorer) {}

  async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown): Promise<void> {
    this.restorer.restore(panel, savedNav(state));
  }
}

function savedNav(state: unknown): NavTarget | undefined {
  if (typeof state !== 'object' || state === null) {
    return undefined;
  }
  const nav = (state as Record<string, unknown>).nav;
  return isNavTarget(nav) ? withoutOneShotIntents(nav) : undefined;
}

// A restored window must not reopen a dialog or comment thread the user already dealt with before the reload.
function withoutOneShotIntents(nav: NavTarget): NavTarget {
  return { tab: nav.tab, section: nav.section, anchor: nav.anchor };
}
