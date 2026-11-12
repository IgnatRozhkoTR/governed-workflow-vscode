import * as vscode from 'vscode';
import { ApiError } from '../api/errors';
import type { DiffFile, WorkspaceRef, WorkspaceState } from '../api/types';
import { baseFileUriParts } from '../fs/uris';
import { joinRepoPath } from '../shared/paths';
import type { ChangeKind, DiffFileRef, DiffSource, OpenAllChangesArgs, OpenDiffArgs } from '../shared/protocol';
import type { WorkspaceLocator } from '../fs/workspaceLocator';

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

export interface WorkspaceSnapshot {
  readonly workspace: WorkspaceRef;
  readonly state: WorkspaceState;
}

interface DiffRefs {
  readonly leftRef: string;
  readonly rightRef?: string;
  readonly repo?: string;
}

type DiffResources = [resource: vscode.Uri, left: vscode.Uri, right: vscode.Uri];

// Diffs open in the editor group the user last focused and reuse its preview tab, so a split layout keeps
// one group for code and the other for the diff under review.
export const DIFF_SHOW_OPTIONS: vscode.TextDocumentShowOptions = {
  viewColumn: vscode.ViewColumn.Active,
  preview: true,
  preserveFocus: false,
};

export function changeKindOf(file: DiffFile): ChangeKind {
  if (file.status === ADDED_STATUS || ADDED_MARKER.test(file.diff)) {
    return 'added';
  }
  if (file.status === DELETED_STATUS || DELETED_MARKER.test(file.diff)) {
    return 'deleted';
  }
  return file.old_path ? 'renamed' : 'modified';
}

export function toDiffFileRef(file: DiffFile): DiffFileRef {
  return { path: file.path, oldPath: file.old_path, kind: changeKindOf(file) };
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
  await vscode.commands.executeCommand('vscode.diff', left, right, title, DIFF_SHOW_OPTIONS);
}

export function openAllChangesFor(locator: WorkspaceLocator, snapshot: WorkspaceSnapshot, args: OpenAllChangesArgs): Promise<void> {
  return openAllChangesAcross(locator, snapshot, [args]);
}

// The multi-diff editor opens in the active editor group; it takes no show options.
export async function openAllChangesAcross(
  locator: WorkspaceLocator,
  snapshot: WorkspaceSnapshot,
  groups: readonly OpenAllChangesArgs[],
): Promise<void> {
  const refsByGroup = groups.map((group) => ({ group, refs: diffRefsFor(group.source, snapshot.state) }));
  const labels = [...new Set(refsByGroup.map(({ refs }) => sidesLabel(refs.leftRef, refs.rightRef)))];
  const title = `${snapshot.workspace.branch} (${labels.join('; ')})`;
  const resources = refsByGroup.flatMap(({ group, refs }) => group.files.map((file) => sidesFor(locator, snapshot, refs, file)));
  await showChangesEditor(title, resources);
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
