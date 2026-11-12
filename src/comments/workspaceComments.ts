import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { NewComment, ReviewComment, WorkspaceRef } from '../api/types';
import type { WorkspaceSnapshot } from '../diff/diffView';
import type { ActiveWorkspace } from '../state/activeWorkspace';
import { rootComments, type CommentsByTarget } from './commentMapping';
import { mergeOutcomes, planResolveAll, reasonOf, resolveEach, type ResolveOutcome } from './commentResolution';

const NO_COMMENTS: CommentsByTarget = {};

export interface ResolutionChange {
  readonly rootIds: readonly number[];
  readonly isResolved: boolean;
}

// Single source of comments for the editor threads, the Comments view and resource comments.
// It reads state.comments from the poller, so web and agent comments arrive with every state update.
export class WorkspaceComments implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly mutateEmitter = new vscode.EventEmitter<void>();
  private readonly resolutionEmitter = new vscode.EventEmitter<ResolutionChange>();
  private readonly listeners: vscode.Disposable[];

  readonly onDidChange: vscode.Event<void> = this.changeEmitter.event;
  readonly onDidMutate: vscode.Event<void> = this.mutateEmitter.event;
  readonly onDidChangeResolution: vscode.Event<ResolutionChange> = this.resolutionEmitter.event;

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
    this.afterResolutionChange({ rootIds: [rootId], isResolved });
  }

  async resolveRoots(rootIds: readonly number[]): Promise<ResolveOutcome> {
    const outcome = await this.resolveEachRoot(this.requireSnapshot().workspace, rootIds);
    this.afterBulkResolve(outcome);
    return outcome;
  }

  async resolveAll(roots: readonly ReviewComment[]): Promise<ResolveOutcome> {
    const { workspace, state } = this.requireSnapshot();
    const plan = planResolveAll(roots);
    const outcomes = await Promise.all([
      this.resolveReviewThreads(state.workspace_id, plan.reviewRoots),
      this.resolveEachRoot(workspace, plan.otherRoots.map((root) => root.id)),
    ]);
    const outcome = mergeOutcomes(outcomes);
    this.afterBulkResolve(outcome);
    return outcome;
  }

  dispose(): void {
    this.listeners.forEach((listener) => listener.dispose());
    this.changeEmitter.dispose();
    this.mutateEmitter.dispose();
    this.resolutionEmitter.dispose();
  }

  private resolveEachRoot(workspace: WorkspaceRef, rootIds: readonly number[]): Promise<ResolveOutcome> {
    return resolveEach(rootIds, (rootId) => this.client.resolveComment(workspace, rootId, true));
  }

  private async resolveReviewThreads(workspaceId: number, reviewRoots: readonly ReviewComment[]): Promise<ResolveOutcome> {
    if (reviewRoots.length === 0) {
      return { resolvedIds: [], failures: [] };
    }
    try {
      await this.client.resolveAllReviewIssues(workspaceId);
      return { resolvedIds: reviewRoots.map((root) => root.id), failures: [] };
    } catch (error) {
      const failure = { subject: 'code review threads', threadCount: reviewRoots.length, reason: reasonOf(error) };
      return { resolvedIds: [], failures: [failure] };
    }
  }

  private afterBulkResolve(outcome: ResolveOutcome): void {
    if (outcome.resolvedIds.length > 0) {
      this.afterResolutionChange({ rootIds: outcome.resolvedIds, isResolved: true });
    }
  }

  private afterResolutionChange(change: ResolutionChange): void {
    this.resolutionEmitter.fire(change);
    this.afterMutation();
  }

  private afterMutation(): void {
    this.mutateEmitter.fire();
    void this.active.poller?.refreshNow();
  }
}
