import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import type { NewComment } from '../api/types';
import { runWithErrorMessage } from '../diff/diffView';
import type { WorkspaceLocator } from '../fs/workspaceLocator';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { CodeThreadSet } from './codeThreadSet';
import { codeThreads, lineSpanOf, newFileComment, newLineComment, provisionalRoot, type CodeThread } from './commentMapping';
import { commentPathOf, requireCommentPath } from './commentPaths';
import { toLineSpan } from './threadPresentation';
import { WorkspaceComments } from './workspaceComments';

export const REVIEW_CONTROLLER_ID = 'governedWorkflow.review';
export const CREATE_COMMENT_COMMAND = 'governedWorkflow.comment.create';
export const REPLY_COMMENT_COMMAND = 'governedWorkflow.comment.reply';
export const REVEAL_COMMENT_THREAD_COMMAND = 'governedWorkflow.comment.revealThread';
export const RESOLVE_COMMENT_COMMAND = 'governedWorkflow.comment.resolve';
export const UNRESOLVE_COMMENT_COMMAND = 'governedWorkflow.comment.unresolve';
const REVIEW_CONTROLLER_LABEL = 'Governed Workflow';

export interface ReviewCommentDeps {
  readonly client: ApiClient;
  readonly locator: WorkspaceLocator;
  readonly active: ActiveWorkspace;
}

export interface ReviewCommentsHandle {
  readonly comments: WorkspaceComments;
  readonly controller: ReviewCommentController;
}

export class ReviewCommentController implements vscode.Disposable {
  private readonly controller: vscode.CommentController;
  private readonly threads: CodeThreadSet;
  private readonly listeners: vscode.Disposable[];

  constructor(
    private readonly comments: WorkspaceComments,
    private readonly locator: WorkspaceLocator,
  ) {
    this.controller = vscode.comments.createCommentController(REVIEW_CONTROLLER_ID, REVIEW_CONTROLLER_LABEL);
    this.controller.commentingRangeProvider = { provideCommentingRanges: (document) => this.commentingRanges(document) };
    this.controller.options = { prompt: 'Comment for the agent', placeHolder: 'Leave a comment (Markdown supported)' };
    this.threads = new CodeThreadSet(this.controller, locator);
    this.listeners = [
      comments.onDidChange(() => this.refresh()),
      comments.onDidChangeResolution((change) => this.threads.markResolved(change.rootIds, change.isResolved)),
      vscode.workspace.onDidOpenTextDocument((document) => this.threads.placeIn(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.threads.placeIn(document)),
    ];
    this.refresh();
  }

  hasThread(rootId: number): boolean {
    return this.threads.hasThread(rootId);
  }

  filePathOf(thread: vscode.CommentThread): string | undefined {
    return this.threads.filePathOf(thread);
  }

  revealThread(rootId: number): Promise<boolean> {
    return this.threads.reveal(rootId);
  }

  async createComment(reply: vscode.CommentReply): Promise<void> {
    const text = requireText(reply);
    if (text === undefined) {
      return;
    }
    const snapshot = this.comments.requireSnapshot();
    const relPath = requireCommentPath(reply.thread.uri, snapshot, this.locator);
    const comment = await toNewComment(reply.thread, relPath, text);
    const id = await this.comments.add(comment);
    const code: CodeThread = {
      root: provisionalRoot(id, comment, new Date().toISOString()),
      replies: [],
      filePath: relPath,
      lines: lineSpanOf({ line_start: comment.line_start ?? null, line_end: comment.line_end ?? null }),
    };
    this.threads.adopt(reply.thread, code, this.threads.canonicalUri(snapshot, relPath));
  }

  async replyToThread(reply: vscode.CommentReply): Promise<void> {
    const rootId = this.threads.rootIdOf(reply.thread);
    if (rootId === undefined) {
      await this.createComment(reply);
      return;
    }
    const text = requireText(reply);
    if (text !== undefined) {
      await this.comments.reply(rootId, text);
    }
  }

  async setResolved(thread: vscode.CommentThread, isResolved: boolean): Promise<void> {
    const rootId = this.threads.rootIdOf(thread);
    if (rootId !== undefined) {
      await this.comments.setResolved(rootId, isResolved);
    }
  }

  dispose(): void {
    this.listeners.forEach((listener) => listener.dispose());
    this.threads.dispose();
    this.controller.dispose();
  }

  private refresh(): void {
    this.threads.sync(this.comments.snapshot, codeThreads(this.comments.byTarget));
  }

  private commentingRanges(document: vscode.TextDocument): vscode.CommentingRanges | vscode.Range[] {
    const snapshot = this.comments.snapshot;
    if (snapshot === undefined || commentPathOf(document.uri, snapshot, this.locator) === undefined) {
      return [];
    }
    return { enableFileComments: true, ranges: [new vscode.Range(0, 0, Math.max(document.lineCount - 1, 0), 0)] };
  }
}

export function registerReviewComments(context: vscode.ExtensionContext, deps: ReviewCommentDeps): ReviewCommentsHandle {
  const comments = new WorkspaceComments(deps.client, deps.active);
  const controller = new ReviewCommentController(comments, deps.locator);
  context.subscriptions.push(
    comments,
    controller,
    vscode.commands.registerCommand(CREATE_COMMENT_COMMAND, (reply: vscode.CommentReply) =>
      runWithErrorMessage(() => controller.createComment(reply)),
    ),
    vscode.commands.registerCommand(REVEAL_COMMENT_THREAD_COMMAND, (rootId: number) => controller.revealThread(rootId)),
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
  return { comments, controller };
}

async function toNewComment(thread: vscode.CommentThread, relPath: string, text: string): Promise<NewComment> {
  if (thread.range === undefined) {
    return newFileComment(relPath, text);
  }
  const { start, end } = thread.range;
  const document = await vscode.workspace.openTextDocument(thread.uri);
  const lines = toLineSpan(thread.range, document.lineAt(end.line).text.length);
  return newLineComment(relPath, lines, document.lineAt(start.line).text, text);
}

function requireText(reply: vscode.CommentReply): string | undefined {
  const text = reply.text.trim();
  if (text === '') {
    void vscode.window.showWarningMessage('A comment needs some text.');
    return undefined;
  }
  return text;
}
