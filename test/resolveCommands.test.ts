import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewComment } from '../src/api/types';
import type { ResolveOutcome } from '../src/comments/commentResolution';
import { confirmAndResolveAll, RESOLVE_ALL_ACTION, resolveFileComments } from '../src/comments/resolveCommands';
import type { WorkspaceComments } from '../src/comments/workspaceComments';
import { makeComment } from './support/fixtures';
import { window } from './vscodeStub';

const OPEN_REVIEW = makeComment({ id: 1, scope: 'review', target: 'a.ts', file_path: 'a.ts', line_start: 1, line_end: 1 });
const OPEN_PLAN = makeComment({ id: 2, scope: 'plan' });
const RESOLVED_REVIEW = makeComment({ id: 3, scope: 'review', target: 'a.ts', file_path: 'a.ts', resolved: true });

function fakeComments(roots: ReviewComment[], outcome: ResolveOutcome) {
  return {
    byTarget: { all: roots },
    requireSnapshot: vi.fn(),
    resolveAll: vi.fn(async () => outcome),
    resolveRoots: vi.fn(async () => outcome),
  };
}

function asComments(fake: ReturnType<typeof fakeComments>): WorkspaceComments {
  return fake as unknown as WorkspaceComments;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('confirmAndResolveAll', () => {
  it('confirmAndResolveAll_shouldAskWithOpenThreadCountInModal', async () => {
    const comments = fakeComments([OPEN_REVIEW, OPEN_PLAN, RESOLVED_REVIEW], { resolvedIds: [], failures: [] });

    await confirmAndResolveAll(asComments(comments));

    expect(window.showWarningMessage).toHaveBeenCalledWith('Resolve 2 open threads?', expect.objectContaining({ modal: true }), RESOLVE_ALL_ACTION);
  });

  it('confirmAndResolveAll_shouldNotResolve_whenModalIsDismissed', async () => {
    const comments = fakeComments([OPEN_REVIEW], { resolvedIds: [], failures: [] });
    window.showWarningMessage.mockResolvedValue(undefined);

    await confirmAndResolveAll(asComments(comments));

    expect(comments.resolveAll).not.toHaveBeenCalled();
  });

  it('confirmAndResolveAll_shouldResolveOpenRootsAndMentionReopen_whenConfirmed', async () => {
    const comments = fakeComments([OPEN_REVIEW, OPEN_PLAN, RESOLVED_REVIEW], { resolvedIds: [1, 2], failures: [] });
    window.showWarningMessage.mockResolvedValue(RESOLVE_ALL_ACTION);

    await confirmAndResolveAll(asComments(comments));

    expect(comments.resolveAll).toHaveBeenCalledWith([OPEN_REVIEW, OPEN_PLAN]);
    expect(window.showInformationMessage).toHaveBeenCalledWith(expect.stringMatching(/^Resolved 2 threads\. Reopen/));
  });

  it('confirmAndResolveAll_shouldWarnWithFailures_whenSomeThreadsFail', async () => {
    const failure = { subject: 'thread #2', threadCount: 1, reason: 'not found' };
    const comments = fakeComments([OPEN_REVIEW, OPEN_PLAN], { resolvedIds: [1], failures: [failure] });
    window.showWarningMessage.mockResolvedValueOnce(RESOLVE_ALL_ACTION);

    await confirmAndResolveAll(asComments(comments));

    expect(window.showWarningMessage).toHaveBeenLastCalledWith('Resolved 1 of 2 threads. Failed: thread #2: not found.');
    expect(window.showInformationMessage).not.toHaveBeenCalled();
  });

  it('confirmAndResolveAll_shouldSkipModal_whenNothingIsOpen', async () => {
    const comments = fakeComments([RESOLVED_REVIEW], { resolvedIds: [], failures: [] });

    await confirmAndResolveAll(asComments(comments));

    expect(window.showWarningMessage).not.toHaveBeenCalled();
    expect(window.showInformationMessage).toHaveBeenCalledWith('No open comments in this workspace.');
  });
});

describe('resolveFileComments', () => {
  it('resolveFileComments_shouldResolveOnlyOpenThreadsOfThatFile', async () => {
    const otherFile = makeComment({ id: 4, scope: 'review', target: 'b.ts', file_path: 'b.ts' });
    const comments = fakeComments([OPEN_REVIEW, RESOLVED_REVIEW, otherFile, OPEN_PLAN], { resolvedIds: [1], failures: [] });

    await resolveFileComments(asComments(comments), 'a.ts');

    expect(comments.resolveRoots).toHaveBeenCalledWith([1]);
    expect(window.showInformationMessage).toHaveBeenCalledWith('Resolved 1 thread in a.ts.');
  });

  it('resolveFileComments_shouldNotCallServer_whenFileHasNoOpenThreads', async () => {
    const comments = fakeComments([RESOLVED_REVIEW], { resolvedIds: [], failures: [] });

    await resolveFileComments(asComments(comments), 'a.ts');

    expect(comments.resolveRoots).not.toHaveBeenCalled();
  });
});
