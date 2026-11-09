import * as vscode from 'vscode';
import { runWithErrorMessage } from '../diff/diffView';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import { newFileComment } from './commentMapping';
import { requireCommentPath } from './commentPaths';
import type { WorkspaceComments } from './workspaceComments';

export const COMMENT_ON_RESOURCE_COMMAND = 'governedWorkflow.commentOnResource';

export interface ResourceCommentDeps {
  readonly comments: WorkspaceComments;
  readonly locator: WorkspaceLocator;
}

export function registerResourceComments(context: vscode.ExtensionContext, deps: ResourceCommentDeps): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMENT_ON_RESOURCE_COMMAND, (resource?: vscode.Uri) =>
      runWithErrorMessage(() => commentOnResource(deps, resource ?? vscode.window.activeTextEditor?.document.uri)),
    ),
  );
}

async function commentOnResource(deps: ResourceCommentDeps, resource: vscode.Uri | undefined): Promise<void> {
  if (resource === undefined) {
    void vscode.window.showWarningMessage('Select a file or folder of the active workspace to comment on.');
    return;
  }
  const relPath = requireCommentPath(resource, deps.comments.requireSnapshot(), deps.locator);
  const text = await vscode.window.showInputBox({
    title: `Comment on ${relPath}`,
    prompt: 'Shared with the web panel and the agents.',
    placeHolder: 'Leave a comment',
    ignoreFocusOut: true,
    validateInput: (value) => (value.trim() === '' ? 'A comment needs some text.' : undefined),
  });
  if (text === undefined) {
    return;
  }
  await deps.comments.add(newFileComment(relPath, text));
  void vscode.window.showInformationMessage(`Comment added to ${relPath}.`);
}
