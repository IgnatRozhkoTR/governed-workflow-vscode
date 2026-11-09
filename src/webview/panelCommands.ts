import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { WorkspaceRef, WorkspaceState } from '../api/types';
import { pickAndSelectWorkspace } from '../commands/switchWorkspace';
import { NOTIFY_MESSAGES, type NotifyKind } from '../shared/claudeMessages';
import { isNavTarget } from '../shared/navigation';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import type { WorkspaceControlPanelHost } from './controlPanel';

const APPROVE_PLAN_ACTION = 'Approve';

const NOTIFY_CHOICES: readonly { readonly label: string; readonly notifyKind: NotifyKind }[] = [
  { label: 'Check comments', notifyKind: 'comments' },
  { label: 'Go', notifyKind: 'go' },
];

export interface PanelCommandDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly panel: WorkspaceControlPanelHost;
}

interface ActiveSnapshot {
  readonly ref: WorkspaceRef;
  readonly state: WorkspaceState;
}

export function registerPanelCommands(context: vscode.ExtensionContext, deps: PanelCommandDeps): void {
  const { panel } = deps;
  const handlers: Record<string, (arg?: unknown) => Promise<void> | void> = {
    'governedWorkflow.openControlPanel': (arg) => panel.createOrShow(isNavTarget(arg) ? arg : undefined),
    'governedWorkflow.openPlan': () => panel.createOrShow({ tab: 'planning' }),
    'governedWorkflow.approvePlan': () => approvePlan(deps),
    'governedWorkflow.rejectPlan': () => panel.createOrShow({ tab: 'planning', action: 'rejectPlan' }),
    'governedWorkflow.setPhase': () => panel.createOrShow({ tab: 'phase', action: 'setPhase' }),
    'governedWorkflow.toggleYolo': () => toggleYolo(deps),
    'governedWorkflow.notifyClaude': () => notifyClaude(deps),
    'governedWorkflow.switchWorkspace': () => pickAndSelectWorkspace(deps),
  };
  for (const [id, handler] of Object.entries(handlers)) {
    context.subscriptions.push(vscode.commands.registerCommand(id, (arg?: unknown) => reportApiErrors(handler(arg))));
  }
}

async function approvePlan(deps: PanelCommandDeps): Promise<void> {
  const ref = requireRef(deps);
  const choice = await vscode.window.showWarningMessage(`Approve the plan for ${ref.branch}?`, { modal: true }, APPROVE_PLAN_ACTION);
  if (choice !== APPROVE_PLAN_ACTION) {
    return;
  }
  await deps.client.setPlanStatus(ref, 'approved');
  await deps.active.poller?.refreshNow();
}

async function toggleYolo(deps: PanelCommandDeps): Promise<void> {
  const { ref, state } = requireSnapshot(deps);
  await deps.client.setYolo(ref, !state.yolo_mode);
  await deps.active.poller?.refreshNow();
}

async function notifyClaude(deps: PanelCommandDeps): Promise<void> {
  const ref = requireRef(deps);
  const picked = await vscode.window.showQuickPick(NOTIFY_CHOICES, { title: 'Notify Claude', placeHolder: 'Message to send' });
  if (picked === undefined) {
    return;
  }
  await deps.client.terminalNotify(ref, NOTIFY_MESSAGES[picked.notifyKind]);
  void vscode.window.showInformationMessage(`Claude notified on ${ref.branch}.`);
}

function requireRef(deps: PanelCommandDeps): WorkspaceRef {
  const ref = deps.active.ref;
  if (ref === undefined) {
    throw new ApiError(0, 'no_workspace_selected', 'Select a workspace first.');
  }
  return ref;
}

function requireSnapshot(deps: PanelCommandDeps): ActiveSnapshot {
  const ref = requireRef(deps);
  const state = deps.active.state;
  if (state === undefined) {
    throw new ApiError(0, 'state_not_loaded', 'The workspace state has not loaded yet. Try again in a moment.');
  }
  return { ref, state };
}

async function reportApiErrors(action: Promise<void> | void): Promise<void> {
  try {
    await action;
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    void vscode.window.showErrorMessage(error.message);
  }
}
