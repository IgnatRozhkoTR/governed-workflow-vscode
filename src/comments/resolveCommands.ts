import * as vscode from 'vscode';
import { runWithErrorMessage } from '../diff/diffView';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { commentPathOf, requireCommentPath } from './commentPaths';
import { failedThreadCount, openRoots, openRootsInFile, type ResolveOutcome } from './commentResolution';
import type { ReviewCommentController } from './reviewComments';
import type { WorkspaceComments } from './workspaceComments';

export const RESOLVE_THREAD_FILE_COMMAND = 'governedWorkflow.comment.resolveFile';
export const RESOLVE_EDITOR_FILE_COMMAND = 'governedWorkflow.resolveFileComments';
export const RESOLVE_ALL_COMMAND = 'governedWorkflow.resolveAllComments';
export const RESOLVE_ALL_ACTION = 'Resolve All';
const ACTIVE_FILE_HAS_OPEN_COMMENTS_CONTEXT_KEY = 'governedWorkflow.activeFileHasOpenComments';
const REOPEN_HINT = 'Reopen any of them from its thread or the Comments view.';
const LISTED_FAILURES = 3;

export interface ResolveCommandDeps {
  readonly comments: WorkspaceComments;
  readonly controller: ReviewCommentController;
  readonly locator: WorkspaceLocator;
}

export async function resolveFileComments(comments: WorkspaceComments, filePath: string): Promise<void> {
  const roots = openRootsInFile(comments.byTarget, filePath);
  if (roots.length === 0) {
    void vscode.window.showInformationMessage(`No open comments in ${filePath}.`);
    return;
  }
  const outcome = await comments.resolveRoots(roots.map((root) => root.id));
  reportOutcome(outcome, ` in ${filePath}`);
}

export async function confirmAndResolveAll(comments: WorkspaceComments): Promise<void> {
  comments.requireSnapshot();
  const roots = openRoots(comments.byTarget);
  if (roots.length === 0) {
    void vscode.window.showInformationMessage('No open comments in this workspace.');
    return;
  }
  const choice = await vscode.window.showWarningMessage(
    `Resolve ${threadsLabel(roots.length)}?`,
    { modal: true, detail: 'Code review threads are closed as out of scope. You can reopen any thread later.' },
    RESOLVE_ALL_ACTION,
  );
  if (choice !== RESOLVE_ALL_ACTION) {
    return;
  }
  reportOutcome(await comments.resolveAll(roots), '', ` ${REOPEN_HINT}`);
}

function reportOutcome(outcome: ResolveOutcome, location: string, successHint = ''): void {
  const resolvedCount = outcome.resolvedIds.length;
  if (outcome.failures.length === 0) {
    void vscode.window.showInformationMessage(`Resolved ${threadsLabel(resolvedCount, '')}${location}.${successHint}`);
    return;
  }
  const total = resolvedCount + failedThreadCount(outcome);
  const reasons = outcome.failures
    .slice(0, LISTED_FAILURES)
    .map((failure) => `${failure.subject}: ${failure.reason}`)
    .join('; ');
  const more = outcome.failures.length > LISTED_FAILURES ? `; and ${outcome.failures.length - LISTED_FAILURES} more` : '';
  void vscode.window.showWarningMessage(`Resolved ${resolvedCount} of ${threadsLabel(total, '')}${location}. Failed: ${reasons}${more}.`);
}

export function registerResolveCommands(context: vscode.ExtensionContext, deps: ResolveCommandDeps): void {
  const updateContext = (): void => updateActiveFileContext(deps);
  updateContext();
  context.subscriptions.push(
    vscode.commands.registerCommand(RESOLVE_ALL_COMMAND, () => runWithErrorMessage(() => confirmAndResolveAll(deps.comments))),
    vscode.commands.registerCommand(RESOLVE_THREAD_FILE_COMMAND, (thread: vscode.CommentThread) =>
      runWithErrorMessage(() => resolveFileOfThread(deps, thread)),
    ),
    vscode.commands.registerCommand(RESOLVE_EDITOR_FILE_COMMAND, (resource?: vscode.Uri) =>
      runWithErrorMessage(() => resolveFileOfResource(deps, resource ?? vscode.window.activeTextEditor?.document.uri)),
    ),
    deps.comments.onDidChange(updateContext),
    vscode.window.onDidChangeActiveTextEditor(updateContext),
  );
}

async function resolveFileOfThread(deps: ResolveCommandDeps, thread: vscode.CommentThread): Promise<void> {
  const filePath = deps.controller.filePathOf(thread);
  if (filePath === undefined) {
    void vscode.window.showWarningMessage('This thread is not saved yet, so its file has no comments to resolve.');
    return;
  }
  await resolveFileComments(deps.comments, filePath);
}

async function resolveFileOfResource(deps: ResolveCommandDeps, resource: vscode.Uri | undefined): Promise<void> {
  if (resource === undefined) {
    void vscode.window.showWarningMessage('Open a file of the active workspace to resolve its comments.');
    return;
  }
  await resolveFileComments(deps.comments, requireCommentPath(resource, deps.comments.requireSnapshot(), deps.locator));
}

function updateActiveFileContext(deps: ResolveCommandDeps): void {
  const uri = vscode.window.activeTextEditor?.document.uri;
  const snapshot = deps.comments.snapshot;
  const filePath = uri === undefined || snapshot === undefined ? undefined : commentPathOf(uri, snapshot, deps.locator);
  const hasOpenComments = filePath !== undefined && openRootsInFile(deps.comments.byTarget, filePath).length > 0;
  void vscode.commands.executeCommand('setContext', ACTIVE_FILE_HAS_OPEN_COMMENTS_CONTEXT_KEY, hasOpenComments);
}

function threadsLabel(count: number, adjective = 'open '): string {
  return `${count} ${adjective}${count === 1 ? 'thread' : 'threads'}`;
}
