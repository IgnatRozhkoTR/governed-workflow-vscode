import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { pickAndSelectWorkspace } from '../commands/switchWorkspace';
import { joinRepoPath, openAllChangesFor, openDiffFor, type WorkspaceSnapshot } from '../diff/diffView';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { OpenFileArgs, RpcMethod } from '../shared/protocol';
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
    'native.startClaude': (args) => runNative(() => startClaude(args.confirmed)),
    'native.openWorktree': () => runNative(() => executeCommand('governedWorkflow.openWorktree', requireSnapshot(deps).workspace)),
    'native.switchWorkspace': () => runNative(() => pickAndSelectWorkspace(deps)),
    'native.copyText': (args) => runNative(() => vscode.env.clipboard.writeText(requireString(args.text, 'text'))),
    'native.openExternal': (args) => runNative(() => openExternal(requireString(args.url, 'url'))),
    'native.setToken': () => runNative(() => executeCommand('governedWorkflow.setToken')),
  };
}

async function runNative(action: () => Thenable<unknown>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof RpcHandlerError) {
      throw error;
    }
    throw new RpcHandlerError(NATIVE_FAILED_CODE, error instanceof Error ? error.message : String(error));
  }
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

async function openExternal(url: string): Promise<void> {
  const uri = vscode.Uri.parse(url, true);
  if (!EXTERNAL_URL_SCHEMES.has(uri.scheme)) {
    throw new RpcHandlerError(NATIVE_FAILED_CODE, `Only http and https links can be opened, not "${uri.scheme}".`);
  }
  await vscode.env.openExternal(uri);
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
