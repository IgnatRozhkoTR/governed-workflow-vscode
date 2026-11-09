import * as vscode from 'vscode';
import { ApiError } from '../api/errors';
import type { DiffFile, DiffMode, DiffResponse, WorkspaceRef, WorkspaceState } from '../api/types';
import { baseFileUriParts } from '../fs/uris';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { StatePoller } from '../state/statePoller';

export const EMPTY_DOCUMENT_SCHEME = 'gw-empty';
const UNCOMMITTED_BASE_REF = 'HEAD';
const CHANGES_COMMAND = 'vscode.changes';
const ADDED_STATUS = 'new';
const DELETED_STATUS = 'deleted';
const ADDED_MARKER = /^--- \/dev\/null$/m;
const DELETED_MARKER = /^\+\+\+ \/dev\/null$/m;

export interface ActiveWorkspaceSource {
  readonly poller: StatePoller | undefined;
  readonly onDidChange: vscode.Event<unknown>;
}

export interface WorkspaceSnapshot {
  readonly workspace: WorkspaceRef;
  readonly state: WorkspaceState;
}

export interface DiffContext extends WorkspaceSnapshot {
  readonly baseRef: string;
}

export type ChangeKind = 'added' | 'deleted' | 'renamed' | 'modified';

export class ActiveStateTracker implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly activeListener: vscode.Disposable;
  private pollerListener: vscode.Disposable | undefined;
  private latest: WorkspaceSnapshot | undefined;

  readonly onDidChange: vscode.Event<void> = this.changeEmitter.event;

  constructor(private readonly source: ActiveWorkspaceSource) {
    this.activeListener = source.onDidChange(() => this.follow());
    this.follow();
  }

  get snapshot(): WorkspaceSnapshot | undefined {
    return this.latest;
  }

  dispose(): void {
    this.activeListener.dispose();
    this.pollerListener?.dispose();
    this.changeEmitter.dispose();
  }

  private follow(): void {
    this.pollerListener?.dispose();
    this.latest = undefined;
    const poller = this.source.poller;
    this.pollerListener = poller?.onDidChange((state) => this.publish({ workspace: poller.workspace, state }));
    this.changeEmitter.fire();
  }

  private publish(snapshot: WorkspaceSnapshot): void {
    this.latest = snapshot;
    this.changeEmitter.fire();
  }
}

export function changeKindOf(file: DiffFile): ChangeKind {
  if (file.status === ADDED_STATUS || ADDED_MARKER.test(file.diff)) {
    return 'added';
  }
  if (file.status === DELETED_STATUS || DELETED_MARKER.test(file.diff)) {
    return 'deleted';
  }
  return file.old_path ? 'renamed' : 'modified';
}

export function resolveBaseRef(mode: DiffMode, response: DiffResponse, state: WorkspaceState): string {
  if (mode === 'uncommitted') {
    return UNCOMMITTED_BASE_REF;
  }
  const baseRef = response.base ?? state.source_branch;
  if (!baseRef) {
    throw new ApiError(0, 'diff_base_missing', 'The admin panel did not report a base branch for this diff.');
  }
  return baseRef;
}

export function workspaceSideUri(locator: WorkspaceLocator, context: DiffContext, file: DiffFile): vscode.Uri {
  return locator.fileUri(context.workspace, context.state, file.path);
}

export async function openFileDiff(locator: WorkspaceLocator, context: DiffContext, file: DiffFile): Promise<void> {
  const [, left, right] = diffSides(locator, context, file);
  const title = `${file.path} (${context.baseRef} ↔ workspace)`;
  await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

export async function openAllChanges(
  locator: WorkspaceLocator,
  context: DiffContext,
  files: readonly DiffFile[],
): Promise<void> {
  if (files.length === 0) {
    void vscode.window.showInformationMessage('There are no changes to show.');
    return;
  }
  if (!(await isChangesEditorAvailable())) {
    void vscode.window.showWarningMessage('This VS Code version has no multi-file diff editor. Open each file from the Changes view.');
    return;
  }
  const title = `${context.workspace.branch} (${context.baseRef} ↔ workspace)`;
  const resources = files.map((file) => diffSides(locator, context, file));
  await vscode.commands.executeCommand(CHANGES_COMMAND, title, resources);
}

export function registerEmptyDocumentProvider(): vscode.Disposable {
  const provider: vscode.TextDocumentContentProvider = { provideTextDocumentContent: () => '' };
  return vscode.workspace.registerTextDocumentContentProvider(EMPTY_DOCUMENT_SCHEME, provider);
}

export async function runWithErrorMessage(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof ApiError)) {
      throw error;
    }
    void vscode.window.showErrorMessage(error.message);
  }
}

function diffSides(locator: WorkspaceLocator, context: DiffContext, file: DiffFile): [vscode.Uri, vscode.Uri, vscode.Uri] {
  const kind = changeKindOf(file);
  const workspaceSide = workspaceSideUri(locator, context, file);
  const left = kind === 'added' ? emptyDocumentUri(file.path) : baseUri(context, file.old_path ?? file.path);
  const right = kind === 'deleted' ? emptyDocumentUri(file.path) : workspaceSide;
  return [workspaceSide, left, right];
}

function baseUri(context: DiffContext, relPath: string): vscode.Uri {
  return vscode.Uri.from(baseFileUriParts({ workspace: context.workspace, relPath, baseRef: context.baseRef }));
}

function emptyDocumentUri(relPath: string): vscode.Uri {
  return vscode.Uri.from({ scheme: EMPTY_DOCUMENT_SCHEME, path: `/${relPath}` });
}

async function isChangesEditorAvailable(): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  return commands.includes(CHANGES_COMMAND);
}
