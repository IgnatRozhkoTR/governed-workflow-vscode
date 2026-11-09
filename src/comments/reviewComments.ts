import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import type { NewComment, ReviewComment } from '../api/types';
import { BASE_FILE_SCHEME, REMOTE_FILE_SCHEME } from '../fs/uris';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import {
  ActiveStateTracker,
  runWithErrorMessage,
  type ActiveWorkspaceSource,
  type WorkspaceSnapshot,
} from '../diff/diffView';
import { groupReviewThreads, isOutdated, type ReviewThread, type ThreadReply } from './commentMapping';
import { lineHash } from './lineHash';

export const REVIEW_CONTROLLER_ID = 'governedWorkflow.review';
export const CREATE_COMMENT_COMMAND = 'governedWorkflow.comment.create';
export const REPLY_COMMENT_COMMAND = 'governedWorkflow.comment.reply';
export const RESOLVE_COMMENT_COMMAND = 'governedWorkflow.comment.resolve';
export const UNRESOLVE_COMMENT_COMMAND = 'governedWorkflow.comment.unresolve';
export const RESOLVED_THREAD_CONTEXT = 'resolved';
export const UNRESOLVED_THREAD_CONTEXT = 'unresolved';
const REVIEW_CONTROLLER_LABEL = 'Governed Workflow Review';
const REVIEW_SCOPE = 'review';
const USER_AUTHOR = 'user';
const OUTDATED_LABEL = 'outdated';

export interface ReviewCommentDeps {
  readonly client: ApiClient;
  readonly locator: WorkspaceLocator;
  readonly active: ActiveWorkspaceSource;
}

interface LineSelection {
  readonly relPath: string;
  readonly range: vscode.Range;
}

export class ReviewCommentController implements vscode.Disposable {
  private readonly controller: vscode.CommentController;
  private readonly reviewByThread = new Map<vscode.CommentThread, ReviewThread>();
  private readonly listeners: vscode.Disposable[];
  private loadSequence = 0;

  constructor(
    private readonly client: ApiClient,
    private readonly locator: WorkspaceLocator,
    private readonly tracker: ActiveStateTracker,
  ) {
    this.controller = vscode.comments.createCommentController(REVIEW_CONTROLLER_ID, REVIEW_CONTROLLER_LABEL);
    this.controller.commentingRangeProvider = { provideCommentingRanges: (document) => this.commentingRanges(document) };
    this.controller.options = { prompt: 'Add a review comment', placeHolder: 'Review comment for the agent' };
    this.listeners = [
      tracker.onDidChange(() => void runWithErrorMessage(() => this.reload())),
      vscode.workspace.onDidOpenTextDocument((document) => this.relabelThreads(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.relabelThreads(document)),
    ];
  }

  async reload(): Promise<void> {
    const sequence = ++this.loadSequence;
    const snapshot = this.tracker.snapshot;
    const comments = snapshot === undefined ? [] : await this.client.listComments(snapshot.workspace, { scope: REVIEW_SCOPE });
    if (sequence === this.loadSequence) {
      this.replaceThreads(snapshot, comments);
    }
  }

  async createComment(reply: vscode.CommentReply): Promise<void> {
    const snapshot = this.requireSnapshot();
    if (snapshot === undefined || !hasText(reply)) {
      return;
    }
    const selection = this.lineSelection(reply.thread, snapshot);
    if (selection === undefined) {
      return;
    }
    const document = await vscode.workspace.openTextDocument(reply.thread.uri);
    await this.client.addComment(snapshot.workspace, toLineComment(selection, document, reply.text));
    reply.thread.dispose();
    await this.reload();
  }

  async replyToThread(reply: vscode.CommentReply): Promise<void> {
    const review = this.reviewByThread.get(reply.thread);
    if (review === undefined) {
      await this.createComment(reply);
      return;
    }
    const snapshot = this.requireSnapshot();
    if (snapshot === undefined || !hasText(reply)) {
      return;
    }
    await this.client.replyToComment(snapshot.workspace, review.root.id, reply.text.trim());
    await this.reload();
  }

  async setResolved(thread: vscode.CommentThread, isResolved: boolean): Promise<void> {
    const review = this.reviewByThread.get(thread);
    const snapshot = this.requireSnapshot();
    if (review === undefined || snapshot === undefined) {
      return;
    }
    await this.client.resolveComment(snapshot.workspace, review.root.id, isResolved);
    await this.reload();
  }

  dispose(): void {
    this.disposeThreads();
    this.listeners.forEach((listener) => listener.dispose());
    this.controller.dispose();
  }

  private commentingRanges(document: vscode.TextDocument): vscode.Range[] {
    const snapshot = this.tracker.snapshot;
    if (snapshot === undefined || this.relPathOf(document.uri, snapshot) === undefined) {
      return [];
    }
    return [new vscode.Range(0, 0, Math.max(document.lineCount - 1, 0), 0)];
  }

  private relPathOf(uri: vscode.Uri, snapshot: WorkspaceSnapshot): string | undefined {
    // Base-ref documents show old line numbers, so comments there would point at the wrong lines.
    if (uri.scheme === BASE_FILE_SCHEME) {
      return undefined;
    }
    if (uri.scheme === REMOTE_FILE_SCHEME && uri.authority !== snapshot.workspace.projectId) {
      return undefined;
    }
    return this.locator.relPathOf(uri, snapshot.state);
  }

  private lineSelection(thread: vscode.CommentThread, snapshot: WorkspaceSnapshot): LineSelection | undefined {
    const relPath = this.relPathOf(thread.uri, snapshot);
    if (relPath === undefined || thread.range === undefined) {
      void vscode.window.showWarningMessage('Review comments can only be added to lines of files in the active workspace.');
      return undefined;
    }
    return { relPath, range: thread.range };
  }

  private requireSnapshot(): WorkspaceSnapshot | undefined {
    const snapshot = this.tracker.snapshot;
    if (snapshot === undefined) {
      void vscode.window.showWarningMessage('Select a workspace before working with review comments.');
    }
    return snapshot;
  }

  private replaceThreads(snapshot: WorkspaceSnapshot | undefined, comments: readonly ReviewComment[]): void {
    this.disposeThreads();
    if (snapshot === undefined) {
      return;
    }
    for (const review of [...groupReviewThreads(comments).values()].flat()) {
      this.reviewByThread.set(this.createThread(snapshot, review), review);
    }
  }

  private createThread(snapshot: WorkspaceSnapshot, review: ReviewThread): vscode.CommentThread {
    const uri = this.locator.fileUri(snapshot.workspace, snapshot.state, review.filePath);
    const range = new vscode.Range(review.lineStart - 1, 0, review.lineEnd - 1, 0);
    const thread = this.controller.createCommentThread(uri, range, toComments(review));
    const isResolved = review.root.resolved;
    thread.state = isResolved ? vscode.CommentThreadState.Resolved : vscode.CommentThreadState.Unresolved;
    thread.contextValue = isResolved ? RESOLVED_THREAD_CONTEXT : UNRESOLVED_THREAD_CONTEXT;
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Collapsed;
    const document = vscode.workspace.textDocuments.find((open) => open.uri.toString() === uri.toString());
    thread.label = document === undefined ? undefined : outdatedLabel(review, document);
    return thread;
  }

  private relabelThreads(document: vscode.TextDocument): void {
    const documentUri = document.uri.toString();
    for (const [thread, review] of this.reviewByThread) {
      if (thread.uri.toString() === documentUri) {
        thread.label = outdatedLabel(review, document);
      }
    }
  }

  private disposeThreads(): void {
    this.reviewByThread.forEach((_, thread) => thread.dispose());
    this.reviewByThread.clear();
  }
}

export function registerReviewComments(context: vscode.ExtensionContext, deps: ReviewCommentDeps): ReviewCommentController {
  const tracker = new ActiveStateTracker(deps.active);
  const controller = new ReviewCommentController(deps.client, deps.locator, tracker);
  context.subscriptions.push(
    tracker,
    controller,
    vscode.commands.registerCommand(CREATE_COMMENT_COMMAND, (reply: vscode.CommentReply) =>
      runWithErrorMessage(() => controller.createComment(reply)),
    ),
    vscode.commands.registerCommand(REPLY_COMMENT_COMMAND, (reply: vscode.CommentReply) =>
      runWithErrorMessage(() => controller.replyToThread(reply)),
    ),
    vscode.commands.registerCommand(RESOLVE_COMMENT_COMMAND, (thread: vscode.CommentThread) =>
      runWithErrorMessage(() => controller.setResolved(thread, true)),
    ),
    vscode.commands.registerCommand(UNRESOLVE_COMMENT_COMMAND, (thread: vscode.CommentThread) =>
      runWithErrorMessage(() => controller.setResolved(thread, false)),
    ),
  );
  return controller;
}

function toLineComment(selection: LineSelection, document: vscode.TextDocument, text: string): NewComment {
  return {
    scope: REVIEW_SCOPE,
    target: selection.relPath,
    file_path: selection.relPath,
    line_start: selection.range.start.line + 1,
    line_end: selection.range.end.line + 1,
    line_hash: lineHash(document.lineAt(selection.range.start.line).text),
    text: text.trim(),
    author: USER_AUTHOR,
  };
}

function toComments(review: ReviewThread): vscode.Comment[] {
  const root: vscode.Comment = {
    ...toComment(review.root),
    label: review.root.resolution ?? undefined,
    contextValue: review.root.resolution ?? undefined,
  };
  return [root, ...review.replies.map(toComment)];
}

function toComment(source: ThreadReply): vscode.Comment {
  return {
    body: new vscode.MarkdownString(source.text),
    mode: vscode.CommentMode.Preview,
    author: { name: source.author },
    timestamp: new Date(source.created_at),
  };
}

function outdatedLabel(review: ReviewThread, document: vscode.TextDocument): string | undefined {
  const lineIndex = review.lineStart - 1;
  const currentText = lineIndex < document.lineCount ? document.lineAt(lineIndex).text : '';
  return isOutdated(review.root, currentText) ? OUTDATED_LABEL : undefined;
}

function hasText(reply: vscode.CommentReply): boolean {
  if (reply.text.trim() === '') {
    void vscode.window.showWarningMessage('A review comment needs some text.');
    return false;
  }
  return true;
}
