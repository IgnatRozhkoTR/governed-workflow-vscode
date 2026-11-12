import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import type { WorkspaceRef, WorkspaceState } from '../src/api/types';
import { WorkspaceComments } from '../src/comments/workspaceComments';
import type { ActiveWorkspace } from '../src/state/activeWorkspace';
import { makeComment, makeState } from './support/fixtures';
import { EventEmitter } from './vscodeStub';

const REF: WorkspaceRef = { projectId: 'p', branch: 'b' };

class FakeActive {
  ref: WorkspaceRef | undefined = REF;
  state: WorkspaceState | undefined = makeState();
  readonly poller = { refreshNow: vi.fn(async () => undefined) };
  readonly changes = new EventEmitter<WorkspaceRef | undefined>();
  readonly stateChanges = new EventEmitter<WorkspaceState>();
  readonly onDidChange = this.changes.event;
  readonly onDidChangeState = this.stateChanges.event;
}

const client = { addComment: vi.fn(), replyToComment: vi.fn(), resolveComment: vi.fn(), resolveAllReviewIssues: vi.fn() };

let active: FakeActive;
let comments: WorkspaceComments;

beforeEach(() => {
  vi.resetAllMocks();
  active = new FakeActive();
  comments = new WorkspaceComments(client as unknown as ApiClient, active as unknown as ActiveWorkspace);
});

describe('WorkspaceComments', () => {
  it('snapshot_shouldBeUndefined_whenStateHasNotLoaded', () => {
    active.state = undefined;

    expect(comments.snapshot).toBeUndefined();
  });

  it('snapshot_shouldPairRefWithState_whenBothAreAvailable', () => {
    expect(comments.snapshot).toEqual({ workspace: REF, state: active.state });
  });

  it('byTarget_shouldReturnStateComments', () => {
    const root = makeComment({ id: 4 });
    active.state = makeState({ comments: { 'plan:Entire plan': [root] } });

    expect(comments.byTarget).toEqual({ 'plan:Entire plan': [root] });
  });

  it('byTarget_shouldBeEmpty_whenNoStateIsLoaded', () => {
    active.state = undefined;

    expect(comments.byTarget).toEqual({});
  });

  it('find_shouldReturnRootById_andIgnoreReplies', () => {
    const root = makeComment({ id: 4 });
    const reply = makeComment({ id: 5, parent_id: 4 });
    active.state = makeState({ comments: { t: [root, reply] } });

    expect(comments.find(4)).toBe(root);
    expect(comments.find(5)).toBeUndefined();
  });

  it('requireSnapshot_shouldThrowNoWorkspaceError_whenNothingIsSelected', () => {
    active.ref = undefined;

    expect(() => comments.requireSnapshot()).toThrowError(expect.objectContaining({ code: 'no_workspace' }));
  });

  it('onDidChange_shouldFire_whenWorkspaceOrStateChanges', () => {
    const listener = vi.fn();
    comments.onDidChange(listener);

    active.changes.fire(REF);
    active.stateChanges.fire(makeState());

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('add_shouldPostCommentRefreshPollerAndFireMutate', async () => {
    client.addComment.mockResolvedValue(42);
    const onMutate = vi.fn();
    comments.onDidMutate(onMutate);
    const draft = { scope: 'review', target: 'a.ts', text: 'hi' };

    const id = await comments.add(draft);

    expect(id).toBe(42);
    expect(client.addComment).toHaveBeenCalledWith(REF, draft);
    expect(onMutate).toHaveBeenCalledOnce();
    expect(active.poller.refreshNow).toHaveBeenCalledOnce();
  });

  it('add_shouldNotCallClient_whenNoWorkspaceIsSelected', async () => {
    active.ref = undefined;

    await expect(comments.add({ scope: 'review', text: 'hi' })).rejects.toMatchObject({ code: 'no_workspace' });
    expect(client.addComment).not.toHaveBeenCalled();
  });

  it('reply_shouldSendTrimmedText', async () => {
    client.replyToComment.mockResolvedValue(1);

    await comments.reply(7, '  thanks  ');

    expect(client.replyToComment).toHaveBeenCalledWith(REF, 7, 'thanks');
  });

  it('setResolved_shouldCallClientAndRefresh', async () => {
    client.resolveComment.mockResolvedValue(undefined);

    await comments.setResolved(7, true);

    expect(client.resolveComment).toHaveBeenCalledWith(REF, 7, true);
    expect(active.poller.refreshNow).toHaveBeenCalledOnce();
  });

  it('setResolved_shouldNotFireMutate_whenClientFails', async () => {
    client.resolveComment.mockRejectedValue(new Error('boom'));
    const onMutate = vi.fn();
    comments.onDidMutate(onMutate);

    await expect(comments.setResolved(7, true)).rejects.toThrow('boom');
    expect(onMutate).not.toHaveBeenCalled();
  });

  it('setResolved_shouldAnnounceResolutionChange_afterServerAccepts', async () => {
    client.resolveComment.mockResolvedValue(undefined);
    const onResolution = vi.fn();
    comments.onDidChangeResolution(onResolution);

    await comments.setResolved(7, false);

    expect(onResolution).toHaveBeenCalledWith({ rootIds: [7], isResolved: false });
  });

  it('resolveAll_shouldUseEndpointForReviewThreads_andResolveOtherScopesOneByOne', async () => {
    client.resolveAllReviewIssues.mockResolvedValue(2);
    client.resolveComment.mockResolvedValue(undefined);
    const roots = [
      makeComment({ id: 1, scope: 'review', target: 'a.ts' }),
      makeComment({ id: 2, scope: 'review', target: 'b.ts' }),
      makeComment({ id: 3, scope: 'plan' }),
    ];

    const outcome = await comments.resolveAll(roots);

    expect(client.resolveAllReviewIssues).toHaveBeenCalledWith(1);
    expect(client.resolveComment).toHaveBeenCalledOnce();
    expect(client.resolveComment).toHaveBeenCalledWith(REF, 3, true);
    expect(outcome).toEqual({ resolvedIds: [1, 2, 3], failures: [] });
  });

  it('resolveAll_shouldReportPartialFailure_andStillApplyAndRefreshTheSuccesses', async () => {
    client.resolveAllReviewIssues.mockResolvedValue(1);
    client.resolveComment.mockImplementation(async (_ref: WorkspaceRef, rootId: number) => {
      if (rootId === 4) {
        throw new Error('not found');
      }
    });
    const onResolution = vi.fn();
    const onMutate = vi.fn();
    comments.onDidChangeResolution(onResolution);
    comments.onDidMutate(onMutate);
    const roots = [makeComment({ id: 1, scope: 'review' }), makeComment({ id: 3, scope: 'plan' }), makeComment({ id: 4, scope: 'research' })];

    const outcome = await comments.resolveAll(roots);

    expect(outcome.resolvedIds).toEqual([1, 3]);
    expect(outcome.failures).toEqual([{ subject: 'thread #4', threadCount: 1, reason: 'not found' }]);
    expect(onResolution).toHaveBeenCalledWith({ rootIds: [1, 3], isResolved: true });
    expect(onMutate).toHaveBeenCalledOnce();
    expect(active.poller.refreshNow).toHaveBeenCalledOnce();
  });

  it('resolveAll_shouldCountEveryReviewThreadAsFailed_whenEndpointFails', async () => {
    client.resolveAllReviewIssues.mockRejectedValue(new Error('server down'));
    const onMutate = vi.fn();
    comments.onDidMutate(onMutate);

    const outcome = await comments.resolveAll([makeComment({ id: 1, scope: 'review' }), makeComment({ id: 2, scope: 'review' })]);

    expect(outcome).toEqual({ resolvedIds: [], failures: [{ subject: 'code review threads', threadCount: 2, reason: 'server down' }] });
    expect(onMutate).not.toHaveBeenCalled();
  });

  it('resolveAll_shouldSkipEndpoint_whenNoReviewThreadIsOpen', async () => {
    client.resolveComment.mockResolvedValue(undefined);

    await comments.resolveAll([makeComment({ id: 3, scope: 'plan' })]);

    expect(client.resolveAllReviewIssues).not.toHaveBeenCalled();
  });

  it('resolveRoots_shouldResolveEachId_andRefreshOnce', async () => {
    client.resolveComment.mockResolvedValue(undefined);

    const outcome = await comments.resolveRoots([5, 6]);

    expect(client.resolveComment).toHaveBeenCalledTimes(2);
    expect(outcome.resolvedIds).toEqual([5, 6]);
    expect(active.poller.refreshNow).toHaveBeenCalledOnce();
  });

  it('dispose_shouldStopForwardingActiveChanges', () => {
    const listener = vi.fn();
    comments.onDidChange(listener);

    comments.dispose();
    active.changes.fire(REF);

    expect(listener).not.toHaveBeenCalled();
  });
});
