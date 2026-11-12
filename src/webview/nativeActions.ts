import { homedir } from 'node:os';
import { basename } from 'node:path';
import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { pickAndSelectWorkspace } from '../commands/switchWorkspace';
import { openAllChangesFor, openDiffFor, type WorkspaceSnapshot } from '../diff/diffView';
import { joinRepoPath } from '../shared/paths';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { REVEAL_COMMENT_THREAD_COMMAND } from '../comments/reviewComments';
import type { OpenFileArgs, RpcMethod, SaveFileArgs, SaveFileResult } from '../shared/protocol';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { RpcHandlerError, type RpcHandler } from './rpcHost';

const NATIVE_FAILED_CODE = 'native_failed';
const NO_WORKSPACE_CODE = 'no_workspace';
const EXTERNAL_URL_SCHEMES = new Set(['http', 'https']);
const LINE_END_CHARACTER = Number.MAX_SAFE_INTEGER;

export interface NativeActionDeps {
  readonly client: ApiClient;
  readonly active: ActiveWorkspace;
  readonly locator: WorkspaceLocator;
}

type NativeMethod = Extract<RpcMethod, `native.${string}`>;
export type NativeHandlers = { readonly [M in NativeMethod]: RpcHandler<M> };

export function createNativeHandlers(deps: NativeActionDeps): NativeHandlers {
  return {
    'native.openFile': (args) => runNative(() => openFile(deps, args)),
    'native.openDiff': (args) => runNative(() => openDiffFor(deps.locator, requireSnapshot(deps), args)),
    'native.openAllChanges': (args) => runNative(() => openAllChangesFor(deps.locator, requireSnapshot(deps), args)),
    'native.resumeClaude': () => runNative(() => executeCommand('governedWorkflow.resumeClaude')),
    'native.showTerminal': () => runNative(() => executeCommand('governedWorkflow.showTerminal')),
    'native.terminalLayout': () => runNative(() => executeCommand('governedWorkflow.terminalLayout')),
    'native.startClaude': (args) => runNative(() => startClaude(args.confirmed)),
    'native.openWorktree': () => runNative(() => executeCommand('governedWorkflow.openWorktree', requireSnapshot(deps).workspace)),
    'native.switchWorkspace': () => runNative(() => pickAndSelectWorkspace(deps)),
    'native.revealCommentThread': (args) => runNative(() => revealCommentThread(args.commentId)),
    'native.copyText': (args) => runNative(() => vscode.env.clipboard.writeText(requireString(args.text, 'text'))),
    'native.openExternal': (args) => runNative(() => openExternal(requireString(args.url, 'url'))),
    'native.setToken': () => runNative(() => executeCommand('governedWorkflow.setToken')),
    'native.saveFile': (args) => saveFile(args),
  };
}

async function runNative(action: () => Thenable<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    throw toNativeFailure(error);
  }
}

function toNativeFailure(error: unknown): RpcHandlerError {
  if (error instanceof RpcHandlerError) {
    return error;
  }
  return new RpcHandlerError(NATIVE_FAILED_CODE, error instanceof Error ? error.message : String(error));
}

function requireSnapshot(deps: NativeActionDeps): WorkspaceSnapshot {
  const workspace = deps.active.ref;
  const state = deps.active.state;
  if (workspace === undefined || state === undefined) {
    throw new RpcHandlerError(NO_WORKSPACE_CODE, 'No workspace is selected, or its state has not loaded yet.');
  }
  return { workspace, state };
}

async function openFile(deps: NativeActionDeps, args: OpenFileArgs): Promise<void> {
  const path = requireString(args.path, 'path');
  const uri = args.absolute ? vscode.Uri.file(path) : workspaceFileUri(deps, joinRepoPath(args.repo, path));
  await vscode.window.showTextDocument(uri, { preview: false, selection: selectionFor(args) });
}

function workspaceFileUri(deps: NativeActionDeps, relPath: string): vscode.Uri {
  const snapshot = requireSnapshot(deps);
  return deps.locator.fileUri(snapshot.workspace, snapshot.state, relPath);
}

function selectionFor(args: OpenFileArgs): vscode.Range | undefined {
  if (args.line === undefined || args.line < 1) {
    return undefined;
  }
  const endLine = Math.max(args.endLine ?? args.line, args.line);
  return new vscode.Range(args.line - 1, 0, endLine - 1, LINE_END_CHARACTER);
}

function startClaude(isConfirmed: boolean): Thenable<unknown> {
  return isConfirmed
    ? executeCommand('governedWorkflow.startClaude', { skipConfirm: true })
    : executeCommand('governedWorkflow.startClaude');
}

async function revealCommentThread(commentId: number): Promise<void> {
  if (!Number.isInteger(commentId)) {
    throw new RpcHandlerError(NATIVE_FAILED_CODE, 'The "commentId" argument must be an integer.');
  }
  const isRevealed = await vscode.commands.executeCommand<boolean>(REVEAL_COMMENT_THREAD_COMMAND, commentId);
  if (!isRevealed) {
    throw new RpcHandlerError(NATIVE_FAILED_CODE, 'This comment cannot be shown in the editor.');
  }
}

async function openExternal(url: string): Promise<void> {
  const uri = vscode.Uri.parse(url, true);
  if (!EXTERNAL_URL_SCHEMES.has(uri.scheme)) {
    throw new RpcHandlerError(NATIVE_FAILED_CODE, `Only http and https links can be opened, not "${uri.scheme}".`);
  }
  await vscode.env.openExternal(uri);
}

async function saveFile(args: SaveFileArgs): Promise<SaveFileResult> {
  const fileName = basename(requireString(args.suggestedName, 'suggestedName'));
  if (typeof args.content !== 'string') {
    throw new RpcHandlerError(NATIVE_FAILED_CODE, 'The "content" argument must be a string.');
  }
  try {
    const target = await vscode.window.showSaveDialog({ defaultUri: defaultSaveUri(fileName), saveLabel: 'Download' });
    if (target === undefined) {
      return { saved: false };
    }
    await vscode.workspace.fs.writeFile(target, new TextEncoder().encode(args.content));
    return { saved: true };
  } catch (error) {
    throw toNativeFailure(error);
  }
}

function defaultSaveUri(fileName: string): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(homedir());
  return vscode.Uri.joinPath(folder, fileName);
}

function executeCommand(command: string, ...args: unknown[]): Thenable<unknown> {
  return vscode.commands.executeCommand(command, ...args);
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new RpcHandlerError(NATIVE_FAILED_CODE, `The "${name}" argument must be a non-empty string.`);
  }
  return value;
}
