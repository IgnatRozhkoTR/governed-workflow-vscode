import * as vscode from 'vscode';
import WebSocket from 'ws';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { WorkspaceRef } from '../api/types';
import { unwrapRef, type RefArgument } from '../commands/refArgument';

const CONFIG_SECTION = 'governedWorkflow';
const MAXIMIZE_SETTING = 'terminal.maximize';
const MAXIMIZE_COMMAND = 'workbench.action.maximizeEditorHideSidebar';
const HTTP_SERVICE_UNAVAILABLE = 503;
const ANSI_RED = '\x1b[31m';
const ANSI_RESET = '\x1b[0m';
const START_CONFIRM_ACTION = 'Kill and start fresh';

export interface ActiveWorkspaceSource {
  readonly workspace: WorkspaceRef | undefined;
}

export interface ClaudeTerminalDeps {
  readonly client: ApiClient;
  readonly activeWorkspace: ActiveWorkspaceSource;
}

export interface StartClaudeOptions {
  readonly ref?: WorkspaceRef;
  readonly skipConfirm?: boolean;
}

type StartClaudeArgument = RefArgument | StartClaudeOptions;

type Dimensions = Readonly<{ columns: number; rows: number }>;

function isStartClaudeOptions(arg: StartClaudeArgument): arg is StartClaudeOptions {
  return typeof arg === 'object' && 'skipConfirm' in arg;
}

function workspaceKey(workspace: WorkspaceRef): string {
  return `${workspace.projectId}\u0000${workspace.branch}`;
}

function parseServerError(text: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      const { error } = parsed as { error: unknown };
      return typeof error === 'string' ? error : String(error);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export class ClaudeTerminal implements vscode.Pseudoterminal {
  private readonly writeEmitter = new vscode.EventEmitter<string>();
  private readonly closeEmitter = new vscode.EventEmitter<number | void>();
  private socket: WebSocket | undefined;
  private dimensions: Dimensions | undefined;
  private isFirstFrame = true;
  private hasServerError = false;
  private isDisposedByUser = false;
  private isFinished = false;

  readonly onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  readonly onDidClose: vscode.Event<number | void> = this.closeEmitter.event;

  constructor(private readonly socketUrl: string) {}

  open(initialDimensions: vscode.TerminalDimensions | undefined): void {
    this.dimensions = initialDimensions;
    const socket = new WebSocket(this.socketUrl);
    this.socket = socket;
    socket.on('open', () => this.sendResize());
    socket.on('message', (data, isBinary) => this.handleFrame(isBinary ? data.toString('binary') : data.toString()));
    socket.on('error', (error) => this.finish(`Connection error: ${error.message}`));
    socket.on('close', () => this.finish('Connection closed. The Claude session keeps running.'));
  }

  close(): void {
    this.isDisposedByUser = true;
    this.socket?.close();
  }

  handleInput(data: string): void {
    this.sendIfOpen(data);
  }

  setDimensions(dimensions: vscode.TerminalDimensions): void {
    this.dimensions = dimensions;
    this.sendResize();
  }

  private handleFrame(text: string): void {
    if (this.isFirstFrame) {
      this.isFirstFrame = false;
      const error = parseServerError(text);
      if (error !== undefined) {
        this.hasServerError = true;
        this.writeEmitter.fire(`${ANSI_RED}${error}${ANSI_RESET}\r\n`);
        void vscode.window.showErrorMessage(`Claude terminal: ${error}`);
        this.socket?.close();
        return;
      }
    }
    this.writeEmitter.fire(text);
  }

  private sendResize(): void {
    if (this.dimensions !== undefined) {
      this.sendIfOpen(JSON.stringify({ resize: [this.dimensions.columns, this.dimensions.rows] }));
    }
  }

  private sendIfOpen(payload: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    }
  }

  private finish(message: string): void {
    if (this.isFinished) {
      return;
    }
    this.isFinished = true;
    if (!this.isDisposedByUser && !this.hasServerError) {
      void vscode.window.showWarningMessage(`Claude terminal: ${message}`);
    }
    this.closeEmitter.fire();
  }
}

class ClaudeTerminalManager {
  private readonly terminals = new Map<string, vscode.Terminal>();

  constructor(private readonly deps: ClaudeTerminalDeps) {}

  forget(terminal: vscode.Terminal): void {
    for (const [key, open] of this.terminals) {
      if (open === terminal) {
        this.terminals.delete(key);
      }
    }
  }

  async resume(ref: WorkspaceRef): Promise<void> {
    const existing = this.terminals.get(workspaceKey(ref));
    if (existing !== undefined) {
      existing.show();
      return;
    }
    await this.runSessionCall(() => this.deps.client.terminalResume(ref), ref);
  }

  async startFresh(ref: WorkspaceRef, skipConfirm: boolean): Promise<void> {
    if (!skipConfirm && !(await this.confirmStartFresh(ref))) {
      return;
    }
    this.terminals.get(workspaceKey(ref))?.dispose();
    this.terminals.delete(workspaceKey(ref));
    await this.runSessionCall(() => this.deps.client.terminalStart(ref), ref);
  }

  private async confirmStartFresh(ref: WorkspaceRef): Promise<boolean> {
    const choice = await vscode.window.showWarningMessage(
      `Start a fresh Claude session for ${ref.branch}? This kills the running session.`,
      { modal: true },
      START_CONFIRM_ACTION,
    );
    return choice === START_CONFIRM_ACTION;
  }

  private async runSessionCall(call: () => Promise<unknown>, ref: WorkspaceRef): Promise<void> {
    try {
      await call();
      await this.openTerminal(ref);
    } catch (error) {
      this.reportFailure(error);
    }
  }

  private async openTerminal(ref: WorkspaceRef): Promise<void> {
    const url = await this.deps.client.terminalSocketUrl(ref);
    const terminal = vscode.window.createTerminal({
      name: `Claude: ${ref.branch}`,
      pty: new ClaudeTerminal(url),
      location: { viewColumn: vscode.ViewColumn.Active },
    });
    this.terminals.set(workspaceKey(ref), terminal);
    terminal.show();
    await this.maximizeIfConfigured();
  }

  private async maximizeIfConfigured(): Promise<void> {
    if (!vscode.workspace.getConfiguration(CONFIG_SECTION).get<boolean>(MAXIMIZE_SETTING, true)) {
      return;
    }
    try {
      await vscode.commands.executeCommand(MAXIMIZE_COMMAND);
    } catch {
      return;
    }
  }

  private reportFailure(error: unknown): void {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    const message = error.status === HTTP_SERVICE_UNAVAILABLE ? `tmux is unavailable on the admin panel host. ${error.message}` : error.message;
    void vscode.window.showErrorMessage(message);
  }
}

export function registerClaudeTerminal(context: vscode.ExtensionContext, deps: ClaudeTerminalDeps): void {
  const manager = new ClaudeTerminalManager(deps);
  const resolve = (arg: RefArgument): WorkspaceRef | undefined => {
    const target = unwrapRef(arg) ?? deps.activeWorkspace.workspace;
    if (target === undefined) {
      void vscode.window.showInformationMessage('Select a workspace first.');
    }
    return target;
  };
  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((terminal) => manager.forget(terminal)),
    vscode.commands.registerCommand('governedWorkflow.resumeClaude', async (arg?: RefArgument) => {
      const target = resolve(arg);
      if (target !== undefined) {
        await manager.resume(target);
      }
    }),
    vscode.commands.registerCommand('governedWorkflow.startClaude', async (arg?: StartClaudeArgument) => {
      const options = isStartClaudeOptions(arg) ? arg : { ref: unwrapRef(arg) };
      const target = resolve(options.ref);
      if (target !== undefined) {
        await manager.startFresh(target, options.skipConfirm === true);
      }
    }),
  );
}
