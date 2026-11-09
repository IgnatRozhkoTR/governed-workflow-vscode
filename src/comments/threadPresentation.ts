import * as vscode from 'vscode';
import { authorLabel, resolutionLabel, type CodeThread, type LineSpan, type ThreadMessage } from './commentMapping';

export const RESOLVED_THREAD_CONTEXT = 'resolved';
export const UNRESOLVED_THREAD_CONTEXT = 'unresolved';
const OUTDATED_LABEL = 'Outdated: the commented line changed';

export function threadComments(thread: CodeThread): vscode.Comment[] {
  const resolution = resolutionLabel(thread.root.resolution);
  return [{ ...toComment(thread.root), label: resolution }, ...thread.replies.map(toComment)];
}

export function applyResolvedState(thread: vscode.CommentThread, isResolved: boolean): void {
  thread.state = isResolved ? vscode.CommentThreadState.Resolved : vscode.CommentThreadState.Unresolved;
  thread.contextValue = isResolved ? RESOLVED_THREAD_CONTEXT : UNRESOLVED_THREAD_CONTEXT;
  thread.collapsibleState = isResolved
    ? vscode.CommentThreadCollapsibleState.Collapsed
    : vscode.CommentThreadCollapsibleState.Expanded;
}

export function outdatedLabel(isOutdated: boolean): string | undefined {
  return isOutdated ? OUTDATED_LABEL : undefined;
}

export function toEditorRange(lines: LineSpan): vscode.Range {
  return new vscode.Range(lines.start - 1, 0, lines.end - 1, 0);
}

export function toLineSpan(range: vscode.Range): LineSpan {
  return { start: range.start.line + 1, end: range.end.line + 1 };
}

function toComment(message: ThreadMessage): vscode.Comment {
  return {
    body: new vscode.MarkdownString(message.text),
    mode: vscode.CommentMode.Preview,
    author: { name: authorLabel(message.author) },
    timestamp: new Date(message.created_at),
  };
}
