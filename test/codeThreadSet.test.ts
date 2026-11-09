import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../src/api/types';
import { CodeThreadSet } from '../src/comments/codeThreadSet';
import { codeThreads, type CodeThread } from '../src/comments/commentMapping';
import { lineHash } from '../src/comments/lineHash';
import type { WorkspaceLocator } from '../src/fs/workspaceLocator';
import { makeComment, makeState } from './support/fixtures';
import { CommentThreadCollapsibleState, CommentThreadState, Uri, workspace } from './vscodeStub';

const REF: WorkspaceRef = { projectId: 'p', branch: 'b' };
const SNAPSHOT = { workspace: REF, state: makeState() };

interface FakeThread {
  uri: Uri;
  range: { start: { line: number }; end: { line: number }; isEqual(other: unknown): boolean } | undefined;
  comments: { body: { value: string } }[];
  canReply: boolean;
  state: number;
  collapsibleState: number;
  label: string | undefined;
  contextValue: string | undefined;
  dispose: ReturnType<typeof vi.fn>;
}

const created: FakeThread[] = [];
const controller = {
  createCommentThread: vi.fn((uri: Uri, range: FakeThread['range'], comments: FakeThread['comments']) => {
    const thread: FakeThread = {
      uri, range, comments, canReply: false, state: -1, collapsibleState: -1, label: undefined, contextValue: undefined, dispose: vi.fn(),
    };
    created.push(thread);
    return thread;
  }),
};
const locator = { fileUri: (_ref: WorkspaceRef, _state: unknown, relPath: string) => Uri.file(`/ws/${relPath}`) };

function codeThread(id: number, overrides: Parameters<typeof makeComment>[0] = {}): CodeThread {
  const root = makeComment({ id, scope: 'review', target: 'a.ts', file_path: 'a.ts', line_start: 2, line_end: 2, line_hash: null, ...overrides });
  return codeThreads({ t: [root] })[0];
}

function document(path: string, lines: string[]): vscode.TextDocument {
  return { uri: Uri.file(path), getText: () => lines.join('\n') } as unknown as vscode.TextDocument;
}

let set: CodeThreadSet;

beforeEach(() => {
  created.length = 0;
  controller.createCommentThread.mockClear();
  workspace.textDocuments = [];
  set = new CodeThreadSet(controller as unknown as vscode.CommentController, locator as unknown as WorkspaceLocator);
});

describe('CodeThreadSet.sync', () => {
  it('sync_shouldCreateOneThreadPerRoot_withRangeFromLines', () => {
    set.sync(SNAPSHOT, [codeThread(1, { line_start: 3, line_end: 5 })]);

    expect(created).toHaveLength(1);
    expect(created[0].uri.toString()).toBe('file:/ws/a.ts');
    expect(created[0].range).toMatchObject({ start: { line: 2 }, end: { line: 4 } });
    expect(created[0].canReply).toBe(true);
    expect(set.hasThread(1)).toBe(true);
  });

  it('sync_shouldLeaveThreadRangeUndefined_whenCommentIsFileLevel', () => {
    set.sync(SNAPSHOT, [codeThread(1, { line_start: null, line_end: null })]);

    expect(created).toHaveLength(1);
    expect(created[0].range).toBeUndefined();
  });

  it('sync_shouldReuseThread_whenPolledAgainWithSameContent', () => {
    const thread = codeThread(1);
    set.sync(SNAPSHOT, [thread]);
    const comments = created[0].comments;

    set.sync(SNAPSHOT, [thread]);

    expect(created).toHaveLength(1);
    expect(created[0].comments).toBe(comments);
  });

  it('sync_shouldUpdateCommentsInPlace_whenReplyArrives', () => {
    set.sync(SNAPSHOT, [codeThread(1)]);

    set.sync(SNAPSHOT, [codeThread(1, { replies: [{ id: 9, text: 'reply', author: 'claude', created_at: '2026-01-02T00:00:00' }] as never })]);

    expect(created).toHaveLength(1);
    expect(created[0].comments).toHaveLength(2);
  });

  it('sync_shouldCollapseAndMarkResolved_whenThreadGetsResolved', () => {
    set.sync(SNAPSHOT, [codeThread(1)]);
    expect(created[0].state).toBe(CommentThreadState.Unresolved);
    expect(created[0].collapsibleState).toBe(CommentThreadCollapsibleState.Expanded);

    set.sync(SNAPSHOT, [codeThread(1, { resolved: true })]);

    expect(created[0].state).toBe(CommentThreadState.Resolved);
    expect(created[0].collapsibleState).toBe(CommentThreadCollapsibleState.Collapsed);
    expect(created[0].contextValue).toBe('resolved');
  });

  it('sync_shouldDisposeThread_whenRootDisappears', () => {
    set.sync(SNAPSHOT, [codeThread(1), codeThread(2)]);

    set.sync(SNAPSHOT, [codeThread(2)]);

    expect(created[0].dispose).toHaveBeenCalledOnce();
    expect(created[1].dispose).not.toHaveBeenCalled();
    expect(set.hasThread(1)).toBe(false);
  });

  it('sync_shouldDisposeAll_whenSnapshotIsUndefined', () => {
    set.sync(SNAPSHOT, [codeThread(1)]);

    set.sync(undefined, [codeThread(1)]);

    expect(created[0].dispose).toHaveBeenCalledOnce();
    expect(set.hasThread(1)).toBe(false);
  });

  it('sync_shouldRecreateThread_whenCanonicalUriChanges', () => {
    set.sync(SNAPSHOT, [codeThread(1, { file_path: 'a.ts' })]);

    set.sync(SNAPSHOT, [codeThread(1, { file_path: 'b.ts', target: 'b.ts' })]);

    expect(created).toHaveLength(2);
    expect(created[0].dispose).toHaveBeenCalledOnce();
    expect(created[1].uri.toString()).toBe('file:/ws/b.ts');
  });
});

describe('CodeThreadSet.placeIn', () => {
  it('placeIn_shouldMoveThreadToMatchingLine_whenLinesShiftedAndMarkNotOutdated', () => {
    set.sync(SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('target') })]);

    set.placeIn(document('/ws/a.ts', ['new', 'new', 'new', 'target']));

    expect(created[0].range).toMatchObject({ start: { line: 3 }, end: { line: 3 } });
    expect(created[0].label).toBeUndefined();
  });

  it('placeIn_shouldLabelOutdated_whenStoredLineIsGone', () => {
    set.sync(SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('gone') })]);

    set.placeIn(document('/ws/a.ts', ['x', 'y', 'z']));

    expect(created[0].label).toContain('Outdated');
    expect(created[0].range).toMatchObject({ start: { line: 1 } });
  });

  it('placeIn_shouldIgnoreDocumentsOfOtherFiles', () => {
    set.sync(SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('target') })]);

    set.placeIn(document('/ws/other.ts', ['target', 'target', 'target']));

    expect(created[0].range).toMatchObject({ start: { line: 1 } });
  });

  it('sync_shouldPlaceThreadsInAlreadyOpenDocuments', () => {
    workspace.textDocuments = [document('/ws/a.ts', ['target', 'x'])];

    set.sync(SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('target') })]);

    expect(created[0].range).toMatchObject({ start: { line: 0 } });
  });
});

describe('CodeThreadSet.adopt and rootIdOf', () => {
  it('adopt_shouldTrackDraftThread_andResolveRootId', () => {
    const draft = { ...created[0], uri: Uri.file('/ws/a.ts'), comments: [], dispose: vi.fn() } as unknown as vscode.CommentThread;

    set.adopt(draft, codeThread(5), Uri.file('/ws/a.ts'));

    expect(set.rootIdOf(draft)).toBe(5);
    expect(draft.canReply).toBe(true);
  });

  it('adopt_shouldDisposeDraft_whenRootAlreadyHasThread', () => {
    set.sync(SNAPSHOT, [codeThread(5)]);
    const draft = { uri: Uri.file('/ws/a.ts'), dispose: vi.fn() } as unknown as vscode.CommentThread;

    set.adopt(draft, codeThread(5), Uri.file('/ws/a.ts'));

    expect(draft.dispose).toHaveBeenCalledOnce();
    expect(set.rootIdOf(draft)).toBeUndefined();
  });

  it('adopt_shouldKeepDraftOnItsUri_whenDraftIsOnAnotherUri', () => {
    const draft = { ...created[0], uri: Uri.file('/ws/base/a.ts'), comments: [], dispose: vi.fn() } as unknown as vscode.CommentThread;

    set.adopt(draft, codeThread(5), Uri.file('/ws/a.ts'));
    set.sync(SNAPSHOT, [codeThread(5)]);

    expect(draft.dispose).not.toHaveBeenCalled();
    expect(set.rootIdOf(draft)).toBe(5);
  });

  it('dispose_shouldDisposeEveryThread', () => {
    set.sync(SNAPSHOT, [codeThread(1), codeThread(2)]);

    set.dispose();

    expect(created.every((thread) => thread.dispose.mock.calls.length === 1)).toBe(true);
  });
});
