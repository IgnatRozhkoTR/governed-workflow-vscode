import * as vscode from 'vscode';
import type { WorkspaceState } from '../api/types';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { isPlanPending } from './launcherItems';

const HAS_WORKSPACE_CONTEXT_KEY = 'governedWorkflow.hasWorkspace';
const PLAN_PENDING_CONTEXT_KEY = 'governedWorkflow.planPending';
const YOLO_CONTEXT_KEY = 'governedWorkflow.yolo';
const OPEN_PLAN_COMMAND = 'governedWorkflow.openPlan';

// Mirrors the active workspace into context keys (menu visibility) and the "Plan: pending" status bar item.
class WorkspaceIndicators implements vscode.Disposable {
  private readonly planItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

  constructor(private readonly active: ActiveWorkspace) {
    this.planItem.text = '$(checklist) Plan: pending';
    this.planItem.tooltip = 'The plan is waiting for approval. Open it in Workspace Control.';
    this.planItem.command = OPEN_PLAN_COMMAND;
  }

  update(): void {
    const state = this.active.state;
    setContext(HAS_WORKSPACE_CONTEXT_KEY, this.active.ref !== undefined);
    setContext(YOLO_CONTEXT_KEY, state?.yolo_mode === true);
    this.updatePlan(state);
  }

  dispose(): void {
    this.planItem.dispose();
  }

  private updatePlan(state: WorkspaceState | undefined): void {
    const isPending = state !== undefined && isPlanPending(state);
    setContext(PLAN_PENDING_CONTEXT_KEY, isPending);
    if (isPending) {
      this.planItem.show();
    } else {
      this.planItem.hide();
    }
  }
}

function setContext(key: string, value: boolean): void {
  void vscode.commands.executeCommand('setContext', key, value);
}

export function registerWorkspaceIndicators(context: vscode.ExtensionContext, active: ActiveWorkspace): void {
  const indicators = new WorkspaceIndicators(active);
  indicators.update();
  context.subscriptions.push(
    indicators,
    active.onDidChange(() => indicators.update()),
    active.onDidChangeState(() => indicators.update()),
  );
}
