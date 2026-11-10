// @vitest-environment happy-dom
import type { DiffFile, FileSnippet, ReviewComment, WorkspaceState } from '@api-types';
import type { WebviewMessage } from '@shared/protocol';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { JSX } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lineHash } from '../../../src/comments/lineHash';
import { getFileSnippet } from '../../../webview-ui/src/api/core';
import { FileList, type FileListProps } from '../../../webview-ui/src/tabs/changes/FileList';
import { RepoGroups } from '../../../webview-ui/src/tabs/changes/RepoGroups';
import { useBlockingReviewCount } from '../../../webview-ui/src/tabs/review/ReviewTab';
import { store } from '../../../webview-ui/src/store/store';

vi.mock('../../../webview-ui/src/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../webview-ui/src/api/core')>()),
  getFileSnippet: vi.fn(),
}));

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };

function diffFile(path: string, overrides: Partial<DiffFile> = {}): DiffFile {
  return { path, old_path: null, similarity: null, additions: 1, deletions: 0, diff: '', ...overrides };
}

function reviewComment(id: number, target: string, resolved = false): ReviewComment {
  return {
    id, parent_id: null, scope: 'review', target, file_path: null, line_start: null, line_end: null, line_hash: null,
    text: `comment ${id}`, author: 'user', type: null, created_at: '2026-11-09T10:00:00', resolved, resolved_at: null, resolution: resolved ? 'fixed' : 'open', replies: [],
  };
}

function lineComment(id: number, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return { ...reviewComment(id, 'app/discounts.py'), file_path: 'app/discounts.py', line_start: 20, line_end: 22, ...overrides };
}

function loadComments(comments: Record<string, ReviewComment[]>): void {
  const state = { phase: '4.1', plan: {}, comments } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: WORKSPACE, state, etag: null } });
}

function renderList(overrides: Partial<FileListProps> = {}): { onOpenDiff: ReturnType<typeof vi.fn>; onOpenFile: ReturnType<typeof vi.fn> } {
  const onOpenDiff = vi.fn();
  const onOpenFile = vi.fn();
  render(<FileList files={[diffFile('app/discounts.py')]} view="tree" hasFilter={false} repo={undefined} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} {...overrides} />);
  return { onOpenDiff, onOpenFile };
}

function BlockingReviewCount(): JSX.Element {
  return <span data-testid="count">{useBlockingReviewCount()}</span>;
}

beforeEach(() => {
  vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: (_message: WebviewMessage) => undefined, getState: () => undefined, setState: <T,>(state: T) => state }));
  loadComments({});
});

afterEach(() => {
  cleanup();
});

describe('FileList comment targets', () => {
  it('render_shouldCountCommentsUnderRepoPrefixedTarget_whenWorkspaceIsMultiRepo', () => {
    loadComments({ 'review:qa-api/app/discounts.py': [reviewComment(1, 'qa-api/app/discounts.py')] });

    renderList({ repo: 'qa-api', view: 'list' });

    expect(document.querySelector('.gw-changes-file .gw-changes-thread-count')?.textContent).toBe('1');
  });

  it('render_shouldIgnoreRepoPrefixedComments_whenNoRepoIsSelected', () => {
    loadComments({ 'review:qa-api/app/discounts.py': [reviewComment(1, 'qa-api/app/discounts.py')] });

    renderList({ view: 'list' });

    expect(document.querySelector('.gw-changes-file .gw-changes-thread-count')).toBeNull();
  });
});

describe('FileList rows', () => {
  it('render_shouldHideOpenFileButton_whenFileIsDeleted', () => {
    renderList({ files: [diffFile('app/legacy_export.py', { status: 'deleted' })] });

    expect(screen.queryByTitle('vsc.changes.openFile')).toBeNull();
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('render_shouldShowRenameSourceInTreeView_whenFileWasRenamed', () => {
    renderList({ files: [diffFile('app/helpers.py', { old_path: 'app/utils.py' })] });

    expect(screen.getByText('helpers.py ← utils.py')).toBeTruthy();
    expect(screen.getByText('R')).toBeTruthy();
  });

  it('openFile_shouldNotOpenDiff_whenGoToFileIsClicked', () => {
    const { onOpenDiff, onOpenFile } = renderList();

    fireEvent.click(screen.getByTitle('vsc.changes.openFile'));

    expect(onOpenFile).toHaveBeenCalledOnce();
    expect(onOpenDiff).not.toHaveBeenCalled();
  });
});

describe('FileList layout and threads', () => {
  it('render_shouldPlaceCommentColumnAfterStats_soItAlignsAcrossRows', () => {
    renderList({ files: [diffFile('app/a.py', { additions: 1 }), diffFile('app/b.py', { additions: 12345, deletions: 678 })] });

    for (const row of document.querySelectorAll('.gw-changes-row')) {
      const cells = [...row.children].map((child) => child.className.split(' ')[0]);
      expect(cells.slice(-2)).toEqual(['gw-changes-comment-slot', 'gw-changes-letter']);
    }
  });

  it('render_shouldShowOpenThreadsUnderTheirRows_whenThreadsAreShown', () => {
    loadComments({ 'review:app/discounts.py': [reviewComment(1, 'app/discounts.py'), reviewComment(2, 'app/discounts.py', true)] });

    renderList({ isThreadsShown: true });

    expect(document.querySelectorAll('.gw-changes-threads')).toHaveLength(1);
    expect(screen.getByText('comment 1')).toBeTruthy();
    expect(screen.queryByText('comment 2')).toBeNull();
  });

  it('render_shouldNotShowThreads_whenThreadsAreHidden', () => {
    loadComments({ 'review:app/discounts.py': [reviewComment(1, 'app/discounts.py')] });

    renderList();

    expect(document.querySelector('.gw-changes-threads')).toBeNull();
  });
});

describe('useBlockingReviewCount', () => {
  it('useBlockingReviewCount_shouldCountOpenReviewRootsAcrossTargets_andSkipOtherScopes', () => {
    loadComments({
      'review:qa-api/app/a.py': [reviewComment(1, 'qa-api/app/a.py'), reviewComment(2, 'qa-api/app/a.py', true)],
      'review:qa-api/app': [reviewComment(3, 'qa-api/app')],
      'plan:Entire plan': [{ ...reviewComment(4, 'Entire plan'), scope: 'plan' }],
    });

    render(<BlockingReviewCount />);

    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('useBlockingReviewCount_shouldCountResolvedRootsWhoseResolutionIsStillOpen', () => {
    loadComments({ 'review:app/a.py': [reviewComment(1, 'app/a.py'), { ...reviewComment(2, 'app/a.py', true), resolution: 'open' }] });

    render(<BlockingReviewCount />);

    expect(screen.getByTestId('count').textContent).toBe('2');
  });
});

describe('FileList inline thread context', () => {
  it('render_shouldShowLineRangeAndQuoteToggle_likeTheReviewTab', () => {
    loadComments({ 'review:app/discounts.py': [lineComment(1)] });

    renderList({ isThreadsShown: true });

    const threads = document.querySelector('.gw-changes-threads') as HTMLElement;
    expect(threads.textContent).toContain('app/discounts.py:20-22');
    expect(threads.textContent).toContain('research.showQuote');
  });

  it('render_shouldCollapseReplyAndDropTheNewCommentBox_inInlineThreads', () => {
    loadComments({ 'review:app/discounts.py': [lineComment(1)] });

    renderList({ isThreadsShown: true });

    expect(document.querySelector('.gw-changes-threads textarea')).toBeNull();
    expect(screen.getByText('buttons.reply')).toBeTruthy();
  });

  it('render_shouldMarkInlineThreadOutdated_whenAnchoredLineChanged', async () => {
    const snippet: FileSnippet = { path: 'app/discounts.py', lines: ['new text'], total_lines: 40, start: 20, end: 20 };
    vi.mocked(getFileSnippet).mockResolvedValue(snippet);
    loadComments({ 'review:app/discounts.py': [lineComment(1, { line_hash: lineHash('old text') })] });

    renderList({ isThreadsShown: true });

    await waitFor(() => expect(screen.getByText('Comments.outdated')).toBeTruthy());
  });

  it('render_shouldShowResolvedThreadThatStillBlocksApproval', () => {
    loadComments({ 'review:app/discounts.py': [lineComment(1, { resolved: true, resolution: 'open' })] });

    renderList({ isThreadsShown: true });

    expect(screen.getByText('vsc.review.stillBlocking')).toBeTruthy();
    expect(document.querySelector('.gw-changes-thread-count')?.textContent).toBe('1');
  });
});

describe('RepoGroups', () => {
  it('render_shouldGroupFilesUnderEachRepository_andLeaveBlockingCountsToChipsAndFileMarkers', () => {
    loadComments({ 'review:qa-api/app/a.py': [reviewComment(1, 'qa-api/app/a.py')] });
    const repoDiffs = [
      { path: 'qa-api', name: 'qa-api', files: [diffFile('app/a.py')] },
      { path: 'qa-notifier', name: 'qa-notifier', files: [diffFile('send.py'), diffFile('queue.py')] },
    ];

    render(<RepoGroups repoDiffs={repoDiffs} filter="" view="list" isThreadsShown={false} onOpenDiff={vi.fn()} onOpenFile={vi.fn()} />);

    const sections = [...document.querySelectorAll('.gw-changes-repo')];
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['qa-api', 'qa-notifier']);
    expect(sections[0]?.querySelector('.gw-changes-repo-header')?.textContent).not.toContain('vsc.changes.blockingCount');
    expect(sections[0]?.querySelector('.gw-changes-file .gw-changes-thread-count')?.textContent).toBe('1');
    expect(sections[1]?.querySelectorAll('.gw-changes-file')).toHaveLength(2);
  });

  it('openDiff_shouldPassTheOwningRepository_whenAFileIsClicked', () => {
    const onOpenDiff = vi.fn();
    const repoDiffs = [{ path: 'qa-notifier', name: 'qa-notifier', files: [diffFile('send.py')], base: 'main' }];

    render(<RepoGroups repoDiffs={repoDiffs} filter="" view="list" isThreadsShown={false} onOpenDiff={onOpenDiff} onOpenFile={vi.fn()} />);
    fireEvent.click(screen.getByText('send.py'));

    expect(onOpenDiff).toHaveBeenCalledWith(repoDiffs[0], repoDiffs[0]?.files[0]);
  });
});

describe('FileList thread counts', () => {
  it('render_shouldCountAndListOnlyApprovalBlockers_includingResolvedButStillOpen', () => {
    loadComments({ 'review:app/discounts.py': [
      reviewComment(1, 'app/discounts.py'),
      { ...reviewComment(2, 'app/discounts.py'), resolution: 'false_positive' },
      lineComment(3, { resolved: true, resolution: 'open' }),
    ] });

    renderList({ isThreadsShown: true });

    expect(document.querySelector('.gw-changes-thread-count')?.textContent).toBe('2');
    expect(document.querySelectorAll('.gw-changes-threads > *')).toHaveLength(2);
    expect(screen.getByText('vsc.review.stillBlocking')).toBeTruthy();
  });

  const files = [diffFile('app/a.py'), diffFile('app/sub/b.py'), diffFile('readme.md')];

  it('render_shouldShowOneCounterPerRow_withTheBlockingCountAndAPlainCommentIcon', () => {
    loadComments({ 'review:app/a.py': [reviewComment(1, 'app/a.py'), { ...reviewComment(2, 'app/a.py'), resolution: 'false_positive' }] });

    renderList({ files });

    const row = screen.getByTitle('app/a.py').closest('.gw-changes-file') as HTMLElement;
    const marker = row.querySelector('.gw-changes-thread-count');
    expect(marker?.textContent).toBe('1');
    expect(marker?.querySelector('.codicon-comment-unresolved')).not.toBeNull();
    expect(marker?.getAttribute('aria-label')).toBe('vsc.changes.blockingCount');
    expect(row.querySelector('.gw-comment-count')).toBeNull();
    expect(row.querySelector('.gw-comment-icon-open')).toBeNull();
    expect(row.querySelector('.gw-comment-icon')?.getAttribute('aria-label')).toBe('comments.title (2)');
  });

  it('render_shouldShowTheOpenThreadCountOnEachFile', () => {
    loadComments({ 'review:app/a.py': [reviewComment(1, 'app/a.py'), reviewComment(2, 'app/a.py'), reviewComment(3, 'app/a.py', true)] });

    renderList({ files });

    const row = screen.getByTitle('app/a.py').closest('.gw-changes-file');
    expect(row?.querySelector('.gw-changes-thread-count')?.textContent).toBe('2');
  });

  it('render_shouldRollUpSubtreeCountOnFolder_onlyWhileCollapsed', () => {
    loadComments({
      'review:app/a.py': [reviewComment(1, 'app/a.py')],
      'review:app/sub/b.py': [reviewComment(2, 'app/sub/b.py'), reviewComment(3, 'app/sub/b.py')],
      'review:readme.md': [reviewComment(4, 'readme.md')],
    });
    renderList({ files });
    const folder = (): Element | null => screen.getByText('app/').closest('.gw-changes-dir');
    expect(folder()?.querySelector('.gw-changes-thread-count')).toBeNull();

    fireEvent.click(folder() as Element);

    expect(folder()?.querySelector('.gw-changes-thread-count')?.textContent).toBe('3');
  });
});
