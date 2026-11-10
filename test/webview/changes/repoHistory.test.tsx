// @vitest-environment happy-dom
import type { ReviewComment, WorkspaceState } from '@api-types';
import type { NavTarget } from '@shared/navigation';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDiff, getHistory, listBranches, listRepos, type HistoryCommit, type HistoryQuery } from '../../../webview-ui/src/api/changes';
import { store } from '../../../webview-ui/src/store/store';
import { ChangesTab } from '../../../webview-ui/src/tabs/changes/ChangesTab';
import { HistoryPanel } from '../../../webview-ui/src/tabs/changes/HistoryPanel';
import { loadRepoHistories, RepoHistoryGroups } from '../../../webview-ui/src/tabs/changes/RepoHistoryGroups';

vi.mock('../../../webview-ui/src/api/changes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../webview-ui/src/api/changes')>()),
  listRepos: vi.fn(),
  listBranches: vi.fn(),
  getDiff: vi.fn(),
  getHistory: vi.fn(),
}));

const REPOS = [{ path: 'qa-api', name: 'qa-api' }, { path: 'qa-notifier', name: 'qa-notifier' }];

function commit(sha: string, subject: string): HistoryCommit {
  return { sha, full_sha: `${sha}-full`, subject, body: '', author_name: 'dev', author_email: 'dev@x', author_date: '2026-11-09T10:00:00', ahead_of_origin: true };
}

const COMMITS_BY_REPO: Readonly<Record<string, readonly HistoryCommit[]>> = {
  'qa-api': [commit('a1', 'api head'), commit('a2', 'api older')],
  'qa-notifier': [commit('n1', 'notifier head')],
};

let persisted: Record<string, unknown> = {};

function blocker(id: number, target: string): ReviewComment {
  return {
    id, parent_id: null, scope: 'review', target, file_path: target, line_start: 1, line_end: 1, line_hash: null,
    text: `issue ${id}`, author: 'reviewer', type: null, created_at: '2026-11-09T10:00:00', resolved: false, resolved_at: null, resolution: 'open', replies: [],
  };
}

function openWorkspace(comments: Record<string, ReviewComment[]> = {}): void {
  const state = { workspace_id: 1, phase: '3.2.3', phase_sequence: ['3.2.3'], source_branch: 'main', pending_gate: null, plan: {}, comments } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'proj', branch: 'feature/x' }, state, etag: null } });
}

beforeEach(() => {
  persisted = {};
  vi.stubGlobal('acquireVsCodeApi', () => ({
    postMessage: () => undefined,
    getState: () => persisted,
    setState: (next: Record<string, unknown>) => {
      persisted = next;
    },
  }));
  vi.mocked(listRepos).mockResolvedValue({ repos: REPOS });
  vi.mocked(listBranches).mockResolvedValue({ branches: [] });
  vi.mocked(getDiff).mockImplementation(async (query) => ({ files: [], mode: query.mode }));
  vi.mocked(getHistory).mockImplementation(async (query: HistoryQuery) => ({ commits: COMMITS_BY_REPO[query.repo ?? ''] ?? [], source_branch: 'main' }));
  openWorkspace();
});

afterEach(() => {
  cleanup();
  vi.mocked(getDiff).mockReset();
  vi.mocked(getHistory).mockReset();
});

describe('loadRepoHistories', () => {
  it('loadRepoHistories_shouldLoadEachRepositoryHistory_inRepositoryOrder', async () => {
    const histories = await loadRepoHistories(REPOS);

    expect(histories.map((history) => [history.name, history.commits.map((entry) => entry.sha)])).toEqual([['qa-api', ['a1', 'a2']], ['qa-notifier', ['n1']]]);
    expect(vi.mocked(getHistory).mock.calls.map(([query]) => query.repo)).toEqual(['qa-api', 'qa-notifier']);
  });
});

describe('RepoHistoryGroups', () => {
  it('render_shouldGroupCommitsByRepository', () => {
    render(<RepoHistoryGroups histories={REPOS.map((repo) => ({ ...repo, commits: COMMITS_BY_REPO[repo.path] ?? [] }))} onSelectCommit={vi.fn()} />);

    const sections = [...document.querySelectorAll('section.gw-changes-repo')];
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['qa-api', 'qa-notifier']);
    expect(sections[0]?.querySelectorAll('.gw-changes-commit')).toHaveLength(2);
    expect(sections[1]?.textContent).toContain('notifier head');
  });

  it('render_shouldExplainOnceThatCommitActionsAreUnavailable', () => {
    render(<RepoHistoryGroups histories={REPOS.map((repo) => ({ ...repo, commits: COMMITS_BY_REPO[repo.path] ?? [] }))} onSelectCommit={vi.fn()} />);

    expect(screen.getAllByText('vsc.changes.rewriteSingleRepoOnly')).toHaveLength(1);
  });

  it('commitClick_shouldReportRepositoryAndSha', () => {
    const onSelectCommit = vi.fn();
    render(<RepoHistoryGroups histories={[{ ...REPOS[1]!, commits: COMMITS_BY_REPO['qa-notifier'] ?? [] }]} onSelectCommit={onSelectCommit} />);

    fireEvent.click(screen.getByText('notifier head'));

    expect(onSelectCommit).toHaveBeenCalledWith('qa-notifier', 'n1-full');
  });
});

describe('HistoryPanel rewrite availability', () => {
  it('render_shouldDisableRewrites_whenWorkspaceHasSeveralRepositories', () => {
    render(<HistoryPanel commits={COMMITS_BY_REPO['qa-api'] ?? []} branches={[]} activeRef={undefined} activeCommit="a1-full" canRewrite={false} onSelectRef={vi.fn()} onSelectCommit={vi.fn()} />);

    for (const label of ['history.rename', 'history.undo', 'history.squash']) {
      const button = screen.getByText(label).closest('button') as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(button.title).toBe('vsc.changes.rewriteSingleRepoOnly');
    }
    expect(screen.getByText('vsc.changes.rewriteSingleRepoOnly', { selector: 'p' })).toBeTruthy();
  });

  it('render_shouldEnableRewrites_whenSingleRepositoryCommitIsLocal', () => {
    render(<HistoryPanel commits={COMMITS_BY_REPO['qa-api'] ?? []} branches={[]} activeRef={undefined} activeCommit="a1-full" canRewrite onSelectRef={vi.fn()} onSelectCommit={vi.fn()} />);

    expect((screen.getByText('history.rename').closest('button') as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByText('history.undo').closest('button') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('vsc.changes.rewriteSingleRepoOnly')).toBeNull();
  });
});

describe('ChangesTab multi-repo history', () => {
  it('historyToggle_shouldListCommitsGroupedByRepository_whenAllRepositoriesSelected', async () => {
    render(<ChangesTab active nav={{ tab: 'changes' } as NavTarget} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'diff.commit' })).toBeTruthy());

    fireEvent.click(screen.getByRole('tab', { name: 'diff.commit' }));

    await waitFor(() => expect(document.querySelectorAll('section.gw-changes-repo')).toHaveLength(2));
    expect(screen.getByText('api older')).toBeTruthy();
    expect(screen.getByText('notifier head')).toBeTruthy();
  });

  it('commitClick_shouldOpenThatCommitInItsRepository_whenPickedFromAllRepositories', async () => {
    render(<ChangesTab active nav={{ tab: 'changes' } as NavTarget} />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'diff.commit' })).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: 'diff.commit' }));
    await waitFor(() => expect(screen.getByText('api older')).toBeTruthy());

    fireEvent.click(screen.getByText('api older'));

    await waitFor(() => expect(getDiff).toHaveBeenCalledWith(expect.objectContaining({ mode: 'commit', commit: 'a2-full', repo: 'qa-api' })));
    await waitFor(() => expect(document.querySelector('.gw-changes-commit-active')?.textContent).toContain('api older'));
    expect(getDiff).not.toHaveBeenCalledWith(expect.objectContaining({ mode: 'commit', commit: 'a1-full' }));
  });
});

describe('ChangesTab blocking count', () => {
  it('render_shouldCarryTheBlockingCountOnlyInRepoChipsAndFileMarkers', async () => {
    openWorkspace({ 'review:qa-api/app/a.py': [blocker(1, 'qa-api/app/a.py')] });
    vi.mocked(getDiff).mockImplementation(async (query) => ({ files: query.repo === 'qa-api' ? [{ path: 'app/a.py', old_path: null, similarity: null, additions: 1, deletions: 0, diff: '' }] : [], mode: query.mode }));

    render(<ChangesTab active nav={{ tab: 'changes' } as NavTarget} />);

    await waitFor(() => expect(document.querySelectorAll('section.gw-changes-repo')).toHaveLength(2));
    const chipsWithThreads = [...document.querySelectorAll('.gw-changes-repo-chip')].filter((chip) => chip.querySelector('.gw-changes-repo-chip-threads') !== null);
    expect(chipsWithThreads.map((chip) => chip.querySelector('.gw-changes-repo-chip-name')?.textContent)).toEqual(['vsc.changes.allReposChip', 'qa-api']);
    fireEvent.click(screen.getByTitle('vsc.changes.moreActions'));
    expect(screen.getByText('vsc.changes.showThreads').textContent).toBe('vsc.changes.showThreads');
    expect([...document.querySelectorAll('.gw-changes-repo-header')].map((header) => header.textContent).join()).not.toContain('vsc.changes.blockingCount');
    expect(document.querySelectorAll('.gw-changes-thread-count')).toHaveLength(1);
  });
});
