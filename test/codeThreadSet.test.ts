import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../src/api/types';
import { CodeThreadSet } from '../src/comments/codeThreadSet';
import { codeThreads, type CodeThread } from '../src/comments/commentMapping';
import { lineHash } from '../src/comments/lineHash';
import type { WorkspaceLocator } from '../src/fs/workspaceLocator';
import { baseFileUriParts, type UriParts } from '../src/fs/uris';
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
  (workspace.fs as unknown as { stat: () => Promise<unknown> }).stat = () => Promise.resolve({});
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

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function partsUri(parts: UriParts): Uri {
  return { ...parts, toString: () => `${parts.scheme}://${parts.authority}${parts.path}?${parts.query}` } as unknown as Uri;
}

function baseDocument(relPath: string, lines: string[], repo?: string): vscode.TextDocument {
  const uri = partsUri(baseFileUriParts({ workspace: REF, relPath, baseRef: 'main', repo }));
  return { uri, getText: () => lines.join('\n') } as unknown as vscode.TextDocument;
}

function workingDocument(lines: string[]): vscode.TextDocument {
  return { lineCount: lines.length, lineAt: (index: number) => ({ text: lines[index] }), getText: () => lines.join('\n') } as unknown as vscode.TextDocument;
}

describe('CodeThreadSet base side', () => {
  const BASE_SNAPSHOT = { workspace: REF, state: makeState({ source_branch: 'main' }) };
  const stat = vi.fn();

  beforeEach(() => {
    (Uri as unknown as { from: (parts: UriParts) => Uri }).from = partsUri;
    stat.mockReset().mockResolvedValue({});
    (workspace.fs as unknown as { stat: typeof stat }).stat = stat;
    workspace.openTextDocument.mockReset();
  });

  it('placeIn_shouldMoveThreadToBaseDocument_whenStoredLineOnlyMatchesTheBaseSide', async () => {
    workspace.openTextDocument.mockResolvedValue(workingDocument(['x', 'new line']));
    set.sync(BASE_SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('old line') })]);

    set.placeIn(baseDocument('a.ts', ['x', 'old line']));

    await vi.waitFor(() => expect(created).toHaveLength(2));
    expect(created[0].dispose).toHaveBeenCalledOnce();
    expect(created[1].uri.toString()).toContain('gw-base://p/b/a.ts');
    expect(created[1].label).toBeUndefined();
  });

  it('placeIn_shouldKeepThreadOnWorkingTree_whenLinesWereInsertedAboveTheStoredLine', async () => {
    workspace.openTextDocument.mockResolvedValue(workingDocument(['x', 'inserted', 'inserted', 'context line']));
    set.sync(BASE_SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('context line') })]);

    set.placeIn(baseDocument('a.ts', ['x', 'context line']));

    await vi.waitFor(() => expect(workspace.openTextDocument).toHaveBeenCalled());
    await flushPromises();
    expect(created).toHaveLength(1);
    expect(created[0].dispose).not.toHaveBeenCalled();
  });

  it('placeIn_shouldKeepThreadOnWorkingTree_whenLinesWereDeletedAboveTheStoredLine', async () => {
    workspace.openTextDocument.mockResolvedValue(workingDocument(['context line', 'y']));
    set.sync(BASE_SNAPSHOT, [codeThread(1, { line_start: 3, line_end: 3, line_hash: lineHash('context line') })]);

    set.placeIn(baseDocument('a.ts', ['x', 'removed', 'context line']));

    await vi.waitFor(() => expect(workspace.openTextDocument).toHaveBeenCalled());
    await flushPromises();
    expect(created).toHaveLength(1);
    expect(created[0].dispose).not.toHaveBeenCalled();
  });

  it('placeIn_shouldKeepThreadOnWorkingTree_whenWorkingTreeStillHasTheStoredLine', async () => {
    workspace.openTextDocument.mockResolvedValue(workingDocument(['x', 'same line']));
    set.sync(BASE_SNAPSHOT, [codeThread(1, { line_start: 2, line_end: 2, line_hash: lineHash('same line') })]);

    set.placeIn(baseDocument('a.ts', ['x', 'same line']));

    await vi.waitFor(() => expect(workspace.openTextDocument).toHaveBeenCalled());
    expect(created).toHaveLength(1);
    expect(created[0].dispose).not.toHaveBeenCalled();
  });

  it('reveal_shouldAnchorThreadOnBranchBase_whenFileIsDeletedInMultiRepoWorkspace', async () => {
    const snapshot = { workspace: REF, state: makeState({ source_branch: 'main', project_type: 'multi' }) };
    stat.mockRejectedValue({ code: 'FileNotFound' });
    workspace.openTextDocument.mockResolvedValue(document('/unused', ['line']));
    set.sync(snapshot, [codeThread(1, { file_path: 'qa-api/old.py', target: 'qa-api/old.py' })]);

    await set.reveal(1);

    expect(created).toHaveLength(2);
    expect(created[0].dispose).toHaveBeenCalledOnce();
    expect(created[1].uri).toMatchObject({ scheme: 'gw-base', path: '/b/old.py', query: 'ref=main&repo=qa-api' });
    expect(workspace.openTextDocument).toHaveBeenCalledWith(created[1].uri);
  });

  it('sync_shouldAnchorFileAndLineThreadsOnBranchBase_whenFileIsDeleted', async () => {
    stat.mockRejectedValue({ code: 'FileNotFound' });

    set.sync(BASE_SNAPSHOT, [codeThread(1, { line_start: null, line_end: null }), codeThread(2)]);

    await vi.waitFor(() => expect(created).toHaveLength(4));
    expect(stat).toHaveBeenCalledOnce();
    expect(created[2].uri.toString()).toContain('gw-base://p/b/a.ts');
    expect(created[2].range).toBeUndefined();
    expect(created[3].uri.toString()).toContain('gw-base://p/b/a.ts');
  });

  it('sync_shouldKeepThreadsAndRetryLater_whenFileCheckFailsForAnotherReason', async () => {
    stat.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce({ code: 'FileNotFound' });
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);
    await vi.waitFor(() => expect(stat).toHaveBeenCalledOnce());
    await flushPromises();
    expect(created).toHaveLength(1);

    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    await vi.waitFor(() => expect(created).toHaveLength(2));
    expect(created[1].uri.toString()).toContain('gw-base://');
  });

  it('sync_shouldCheckEachFileOncePerSync_whenSeveralThreadsShareIt', async () => {
    set.sync(BASE_SNAPSHOT, [codeThread(1), codeThread(2)]);
    await flushPromises();

    expect(stat).toHaveBeenCalledOnce();
    expect(created).toHaveLength(2);
  });

  it('sync_shouldNotStartSecondCheck_whenPreviousCheckOfSameFileIsStillRunning', async () => {
    stat.mockReturnValue(new Promise(() => undefined));
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    expect(stat).toHaveBeenCalledOnce();
  });

  it('sync_shouldMoveThreadsToBase_whenPresentFileIsDeletedLater', async () => {
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);
    await flushPromises();
    expect(created).toHaveLength(1);
    stat.mockRejectedValue({ code: 'FileNotFound' });

    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    await vi.waitFor(() => expect(created).toHaveLength(2));
    expect(stat).toHaveBeenCalledTimes(2);
    expect(created[1].uri.toString()).toContain('gw-base://p/b/a.ts');
  });

  it('sync_shouldMoveLaterThreadsOfMissingFileToBaseWithoutNewCheck', async () => {
    stat.mockRejectedValue({ code: 'FileNotFound' });
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);
    await vi.waitFor(() => expect(created).toHaveLength(2));

    set.sync(BASE_SNAPSHOT, [codeThread(1), codeThread(2)]);

    expect(created).toHaveLength(4);
    expect(created[3].uri.toString()).toContain('gw-base://p/b/a.ts');
    expect(stat).toHaveBeenCalledOnce();
  });

  it('sync_shouldKeepBaseThreadsStable_whenMissingFileIsPolledRepeatedly', async () => {
    stat.mockRejectedValue({ code: 'FileNotFound' });
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);
    await vi.waitFor(() => expect(created).toHaveLength(2));

    set.sync(BASE_SNAPSHOT, [codeThread(1)]);
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);
    await flushPromises();

    expect(created).toHaveLength(2);
    expect(created[1].dispose).not.toHaveBeenCalled();
    expect(stat).toHaveBeenCalledOnce();
  });

  it('reveal_shouldReturnFalse_whenDocumentFailsToOpen', async () => {
    workspace.openTextDocument.mockRejectedValue(new Error('offline'));
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    expect(await set.reveal(1)).toBe(false);
  });

  it('reveal_shouldReturnFalse_whenThreadIsRemovedWhileCheckingFile', async () => {
    let finishStat: () => void = () => undefined;
    stat.mockReturnValue(new Promise<void>((resolve) => { finishStat = resolve; }));
    workspace.openTextDocument.mockResolvedValue(document('/ws/a.ts', ['line']));
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    const revealed = set.reveal(1);
    set.sync(BASE_SNAPSHOT, []);
    finishStat();

    expect(await revealed).toBe(false);
    expect(workspace.openTextDocument).not.toHaveBeenCalled();
  });

  it('reveal_shouldKeepWorkingTreeThread_whenFileExists', async () => {
    workspace.openTextDocument.mockResolvedValue(document('/ws/a.ts', ['line']));
    set.sync(BASE_SNAPSHOT, [codeThread(1)]);

    await set.reveal(1);

    expect(created).toHaveLength(1);
    expect(workspace.openTextDocument).toHaveBeenCalledWith(created[0].uri);
  });
});
