import * as vscode from 'vscode';
import { ApiError } from '../api/errors';
import type { DiffFile, DiffMode, DiffResponse, WorkspaceRef, WorkspaceState } from '../api/types';
import { baseFileUriParts } from '../fs/uris';
import { joinRepoPath } from '../shared/paths';
import type { ChangeKind, DiffFileRef, DiffSource, OpenAllChangesArgs, OpenDiffArgs } from '../shared/protocol';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { StatePoller } from '../state/statePoller';

export const EMPTY_DOCUMENT_SCHEME = 'gw-empty';
const UNCOMMITTED_BASE_REF = 'HEAD';
const CHANGES_COMMAND = 'vscode.changes';
const ADDED_STATUS = 'new';
const DELETED_STATUS = 'deleted';
const ADDED_MARKER = /^--- \/dev\/null$/m;
const DELETED_MARKER = /^\+\+\+ \/dev\/null$/m;
const WORKSPACE_SIDE_LABEL = 'workspace';
const FULL_SHA_REF = /^([0-9a-f]{40})(.*)$/i;
const SHORT_SHA_LENGTH = 8;

export type { ChangeKind };

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

interface DiffRefs {
  readonly leftRef: string;
  readonly rightRef?: string;
  readonly repo?: string;
}

type DiffResources = [resource: vscode.Uri, left: vscode.Uri, right: vscode.Uri];

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
  return requireBaseRef(response.base ?? state.source_branch);
}

export function workspaceSideUri(locator: WorkspaceLocator, context: DiffContext, file: DiffFile): vscode.Uri {
  return locator.fileUri(context.workspace, context.state, file.path);
}

export async function openFileDiff(locator: WorkspaceLocator, context: DiffContext, file: DiffFile): Promise<void> {
  const [, left, right] = diffSides(locator, context, file);
  const title = `${file.path} (${sidesLabel(context.baseRef)})`;
  await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

export async function openAllChanges(
  locator: WorkspaceLocator,
  context: DiffContext,
  files: readonly DiffFile[],
): Promise<void> {
  const title = `${context.workspace.branch} (${sidesLabel(context.baseRef)})`;
  await showChangesEditor(title, files.map((file) => diffSides(locator, context, file)));
}

async function showChangesEditor(title: string, resources: readonly DiffResources[]): Promise<void> {
  if (resources.length === 0) {
    void vscode.window.showInformationMessage('There are no changes to show.');
    return;
  }
  if (!(await isChangesEditorAvailable())) {
    void vscode.window.showWarningMessage('This VS Code version has no multi-file diff editor. Open each file from the Changes view.');
    return;
  }
  await vscode.commands.executeCommand(CHANGES_COMMAND, title, resources);
}

export async function openDiffFor(locator: WorkspaceLocator, snapshot: WorkspaceSnapshot, args: OpenDiffArgs): Promise<void> {
  const refs = diffRefsFor(args.source, snapshot.state);
  const [, left, right] = sidesFor(locator, snapshot, refs, args.file);
  const title = `${args.file.path} (${sidesLabel(refs.leftRef, refs.rightRef)})`;
  await vscode.commands.executeCommand('vscode.diff', left, right, title);
}

export async function openAllChangesFor(
  locator: WorkspaceLocator,
  snapshot: WorkspaceSnapshot,
  args: OpenAllChangesArgs,
): Promise<void> {
  const refs = diffRefsFor(args.source, snapshot.state);
  const title = `${snapshot.workspace.branch} (${sidesLabel(refs.leftRef, refs.rightRef)})`;
  await showChangesEditor(title, args.files.map((file) => sidesFor(locator, snapshot, refs, file)));
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

function diffSides(locator: WorkspaceLocator, context: DiffContext, file: DiffFile): DiffResources {
  const fileRef: DiffFileRef = { path: file.path, oldPath: file.old_path, kind: changeKindOf(file) };
  return sidesFor(locator, context, { leftRef: context.baseRef }, fileRef);
}

function diffRefsFor(source: DiffSource, state: WorkspaceState): DiffRefs {
  switch (source.mode) {
    case 'commit':
      return commitRefs(source);
    case 'uncommitted':
      return { leftRef: UNCOMMITTED_BASE_REF, repo: source.repo };
    case 'branch':
      return { leftRef: requireBaseRef(source.base ?? state.source_branch), repo: source.repo };
  }
}

function commitRefs(source: DiffSource): DiffRefs {
  if (!source.commit) {
    throw new ApiError(0, 'diff_commit_missing', 'A commit diff needs the commit to compare.');
  }
  return { leftRef: `${source.commit}^`, rightRef: source.commit, repo: source.repo };
}

function requireBaseRef(baseRef: string | null | undefined): string {
  if (!baseRef) {
    throw new ApiError(0, 'diff_base_missing', 'The admin panel did not report a base branch for this diff.');
  }
  return baseRef;
}

function sidesFor(locator: WorkspaceLocator, snapshot: WorkspaceSnapshot, refs: DiffRefs, file: DiffFileRef): DiffResources {
  const workspaceSide = locator.fileUri(snapshot.workspace, snapshot.state, joinRepoPath(refs.repo, file.path));
  const left = file.kind === 'added' ? emptyDocumentUri(file.path) : baseUri(snapshot, refs, refs.leftRef, file.oldPath ?? file.path);
  const right = file.kind === 'deleted' ? emptyDocumentUri(file.path) : rightSideUri(snapshot, refs, file.path, workspaceSide);
  return [workspaceSide, left, right];
}

function rightSideUri(snapshot: WorkspaceSnapshot, refs: DiffRefs, relPath: string, workspaceSide: vscode.Uri): vscode.Uri {
  return refs.rightRef === undefined ? workspaceSide : baseUri(snapshot, refs, refs.rightRef, relPath);
}

function baseUri(snapshot: WorkspaceSnapshot, refs: DiffRefs, ref: string, relPath: string): vscode.Uri {
  return vscode.Uri.from(baseFileUriParts({ workspace: snapshot.workspace, relPath, baseRef: ref, repo: refs.repo }));
}

function sidesLabel(leftRef: string, rightRef?: string): string {
  return `${shortRef(leftRef)} ↔ ${rightRef === undefined ? WORKSPACE_SIDE_LABEL : shortRef(rightRef)}`;
}

function shortRef(ref: string): string {
  const match = FULL_SHA_REF.exec(ref);
  return match === null ? ref : `${match[1].slice(0, SHORT_SHA_LENGTH)}${match[2]}`;
}

function emptyDocumentUri(relPath: string): vscode.Uri {
  return vscode.Uri.from({ scheme: EMPTY_DOCUMENT_SCHEME, path: `/${relPath}` });
}

async function isChangesEditorAvailable(): Promise<boolean> {
  const commands = await vscode.commands.getCommands(true);
  return commands.includes(CHANGES_COMMAND);
}
