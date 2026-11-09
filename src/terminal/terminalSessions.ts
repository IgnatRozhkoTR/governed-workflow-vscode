import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { TerminalSession } from '../api/types';
import { ClaudeTerminal } from './claudeTerminal';

export const TERMINAL_SESSIONS_COMMAND = 'governedWorkflow.terminalSessions';

const ATTACH_ACTION = 'Attach';
const KILL_ACTION = 'Kill';
const KILL_CONFIRM_ACTION = 'Kill session';
const ACTIONS = [ATTACH_ACTION, KILL_ACTION];

export interface TerminalSessionDeps {
  readonly client: ApiClient;
}

export function openSocketTerminal(title: string, socketUrl: string): vscode.Terminal {
  const terminal = vscode.window.createTerminal({
    name: title,
    pty: new ClaudeTerminal(socketUrl, title),
    location: { viewColumn: vscode.ViewColumn.Active },
  });
  terminal.show();
  return terminal;
}

export function registerTerminalSessionCommands(context: vscode.ExtensionContext, deps: TerminalSessionDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(TERMINAL_SESSIONS_COMMAND, () => guarded(() => manageSessions(deps))),
  );
}

async function guarded(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    await vscode.window.showErrorMessage(error.message);
  }
}

async function manageSessions(deps: TerminalSessionDeps): Promise<void> {
  const sessions = await deps.client.listTerminalSessions();
  if (sessions.length === 0) {
    await vscode.window.showInformationMessage('No terminal sessions are running on the admin panel host.');
    return;
  }
  const session = await pickSession(sessions);
  const action = session && (await vscode.window.showQuickPick(ACTIONS, { placeHolder: `Action for ${session.name}` }));
  if (session === undefined || action === undefined) {
    return;
  }
  if (action === ATTACH_ACTION) {
    openSocketTerminal(session.name, await deps.client.terminalSessionSocketUrl(session.name));
    return;
  }
  await killSession(deps, session);
}

async function pickSession(sessions: TerminalSession[]): Promise<TerminalSession | undefined> {
  const items = sessions.map((session) => ({
    label: session.name,
    description: session.attached ? 'attached' : undefined,
    detail: session.command,
    session,
  }));
  const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Terminal session', matchOnDetail: true });
  return picked?.session;
}

async function killSession(deps: TerminalSessionDeps, session: TerminalSession): Promise<void> {
  const choice = await vscode.window.showWarningMessage(
    `Kill the terminal session ${session.name}? Its running process is stopped.`,
    { modal: true },
    KILL_CONFIRM_ACTION,
  );
  if (choice === KILL_CONFIRM_ACTION) {
    await deps.client.killTerminalSession(session.name);
  }
}
