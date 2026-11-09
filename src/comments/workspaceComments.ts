import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { NewComment, ReviewComment } from '../api/types';
import type { WorkspaceSnapshot } from '../diff/diffView';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { rootComments, type CommentsByTarget } from './commentMapping';

const NO_COMMENTS: CommentsByTarget = {};

// Single source of comments for the editor threads, the Comments view and resource comments.
// It reads state.comments from the poller, so web and agent comments arrive with every state update.
export class WorkspaceComments implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly mutateEmitter = new vscode.EventEmitter<void>();
  private readonly listeners: vscode.Disposable[];

  readonly onDidChange: vscode.Event<void> = this.changeEmitter.event;
  readonly onDidMutate: vscode.Event<void> = this.mutateEmitter.event;

  constructor(
    private readonly client: ApiClient,
    private readonly active: ActiveWorkspace,
  ) {
    this.listeners = [
      active.onDidChange(() => this.changeEmitter.fire()),
      active.onDidChangeState(() => this.changeEmitter.fire()),
    ];
  }

  get snapshot(): WorkspaceSnapshot | undefined {
    const { ref, state } = this.active;
    return ref === undefined || state === undefined ? undefined : { workspace: ref, state };
  }

  get byTarget(): CommentsByTarget {
    return this.active.state?.comments ?? NO_COMMENTS;
  }

  find(rootId: number): ReviewComment | undefined {
    return rootComments(this.byTarget).find((comment) => comment.id === rootId);
  }

  requireSnapshot(): WorkspaceSnapshot {
    const snapshot = this.snapshot;
    if (snapshot === undefined) {
      throw new ApiError(0, 'no_workspace', 'Select a workspace before working with comments.');
    }
    return snapshot;
  }

  async add(comment: NewComment): Promise<number> {
    const id = await this.client.addComment(this.requireSnapshot().workspace, comment);
    this.afterMutation();
    return id;
  }

  async reply(rootId: number, text: string): Promise<void> {
    await this.client.replyToComment(this.requireSnapshot().workspace, rootId, text.trim());
    this.afterMutation();
  }

  async setResolved(rootId: number, isResolved: boolean): Promise<void> {
    await this.client.resolveComment(this.requireSnapshot().workspace, rootId, isResolved);
    this.afterMutation();
  }

  dispose(): void {
    this.listeners.forEach((listener) => listener.dispose());
    this.changeEmitter.dispose();
    this.mutateEmitter.dispose();
  }

  private afterMutation(): void {
    this.mutateEmitter.fire();
    void this.active.poller?.refreshNow();
  }
}
