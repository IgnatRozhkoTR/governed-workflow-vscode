import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { PendingGate, WorkspaceRef, WorkspaceState } from '../api/types';

const GATE_PENDING_CONTEXT_KEY = 'governedWorkflow.gatePending';
const APPROVE_LABEL = 'Approve';
const REJECT_LABEL = 'Reject';

export interface ActiveWorkspaceView {
  readonly workspace: WorkspaceRef | undefined;
  readonly poller: { refreshNow(): Promise<void> } | undefined;
  readonly onDidChange: vscode.Event<WorkspaceState | undefined>;
}

export interface GateCommandsDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspaceView;
}

class GateController implements vscode.Disposable {
  private readonly statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
  private pendingGate: PendingGate | undefined;

  constructor(private readonly deps: GateCommandsDeps) {
    this.statusItem.command = 'governedWorkflow.gateActions';
  }

  update(state: WorkspaceState | undefined): void {
    this.pendingGate = state?.pending_gate ?? undefined;
    void vscode.commands.executeCommand('setContext', GATE_PENDING_CONTEXT_KEY, this.pendingGate !== undefined);
    if (this.pendingGate === undefined) {
      this.statusItem.hide();
      return;
    }
    this.statusItem.text = `$(shield) Gate: ${this.pendingGate.phase}`;
    this.statusItem.tooltip = 'Approve or reject the pending gate';
    this.statusItem.show();
  }

  async chooseAction(): Promise<void> {
    const picked = await vscode.window.showQuickPick([APPROVE_LABEL, REJECT_LABEL], {
      placeHolder: this.pendingGate === undefined ? undefined : `Gate: ${this.pendingGate.phase}`,
    });
    if (picked === APPROVE_LABEL) {
      await this.approve();
    } else if (picked === REJECT_LABEL) {
      await this.reject();
    }
  }

  async approve(): Promise<void> {
    const target = this.requireGate();
    if (target === undefined) {
      return;
    }
    const commitMessage = target.gate.accepts_commit_message ? await this.askCommitMessage() : '';
    if (commitMessage === undefined) {
      return;
    }
    await this.submit(() => this.deps.client.approve(target.workspace, commitMessage));
  }

  async reject(): Promise<void> {
    const target = this.requireGate();
    if (target === undefined) {
      return;
    }
    const comments = await vscode.window.showInputBox({
      title: `Reject gate: ${target.gate.phase}`,
      prompt: 'Explain what must change (required)',
      validateInput: (value) => (value.trim() ? undefined : 'Comments are required.'),
    });
    if (comments === undefined) {
      return;
    }
    await this.submit(() => this.deps.client.reject(target.workspace, comments));
  }

  dispose(): void {
    this.statusItem.dispose();
  }

  private requireGate(): { workspace: WorkspaceRef; gate: PendingGate } | undefined {
    const workspace = this.deps.active.workspace;
    if (workspace === undefined || this.pendingGate === undefined) {
      void vscode.window.showInformationMessage('No gate is waiting for a decision.');
      return undefined;
    }
    return { workspace, gate: this.pendingGate };
  }

  private askCommitMessage(): Thenable<string | undefined> {
    return vscode.window.showInputBox({ title: 'Approve gate', prompt: 'Commit message (optional)' });
  }

  private async submit(call: () => Promise<unknown>): Promise<void> {
    try {
      await call();
    } catch (error) {
      if (!(error instanceof ApiError)) {
        throw error;
      }
      void vscode.window.showErrorMessage(error.message);
      return;
    }
    await this.deps.active.poller?.refreshNow();
  }
}

export function registerGateCommands(context: vscode.ExtensionContext, deps: GateCommandsDeps): void {
  const controller = new GateController(deps);
  controller.update(undefined);
  context.subscriptions.push(
    controller,
    deps.active.onDidChange((state) => controller.update(state)),
    vscode.commands.registerCommand('governedWorkflow.approveGate', () => controller.approve()),
    vscode.commands.registerCommand('governedWorkflow.rejectGate', () => controller.reject()),
    vscode.commands.registerCommand('governedWorkflow.gateActions', () => controller.chooseAction()),
  );
}
