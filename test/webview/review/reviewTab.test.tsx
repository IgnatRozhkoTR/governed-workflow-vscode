// @vitest-environment happy-dom
import type { ReviewComment, WorkspaceState } from '@api-types';
import type { NavTarget } from '@shared/navigation';
import type { WebviewMessage } from '@shared/protocol';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import type { JSX } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listRepos, type RepoEntry } from '../../../webview-ui/src/api/changes';
import { listComments, resolveComment } from '../../../webview-ui/src/api/core';
import { store } from '../../../webview-ui/src/store/store';
import { reviewTab } from '../../../webview-ui/src/tabs/review';
import { ReviewTab } from '../../../webview-ui/src/tabs/review/ReviewTab';

vi.mock('../../../webview-ui/src/api/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../webview-ui/src/api/core')>()),
  listComments: vi.fn(),
  resolveComment: vi.fn(),
}));

vi.mock('../../../webview-ui/src/api/changes', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../webview-ui/src/api/changes')>()),
  listRepos: vi.fn(),
}));

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const BLOCKERS_TITLE = /^vsc\.review\.blockersTitle\.(one|other)$/;
const GATE = { phase: '3.2.3', accepts_commit_message: true };

function root(id: number, overrides: Partial<ReviewComment> = {}): ReviewComment {
  return {
    id, parent_id: null, scope: 'review', target: 'app/a.py', file_path: 'app/a.py', line_start: id, line_end: id, line_hash: null,
    text: `issue ${id}`, author: 'reviewer', type: null, created_at: '2026-11-09T10:00:00', resolved: false, resolved_at: null, resolution: 'open', replies: [],
    ...overrides,
  };
}

function loadState(comments: readonly ReviewComment[], overrides: Partial<WorkspaceState> = {}): void {
  const state = { workspace_id: 1, phase: '3.2.3', phase_sequence: ['3.2.3', '5.1'], pending_gate: GATE, plan: {}, comments: { 'review:app/a.py': comments }, ...overrides } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: WORKSPACE, state, etag: null } });
  vi.mocked(listComments).mockResolvedValue({ comments: [...comments] });
}

function attachRepos(repos: readonly RepoEntry[]): void {
  vi.mocked(listRepos).mockResolvedValue({ repos: [...repos] });
}

function expandBlockers(): HTMLElement {
  const banner = document.querySelector('.gw-review-blockers') as HTMLElement;
  fireEvent.click(banner.querySelector('.gw-collapsible-summary') as HTMLButtonElement);
  return banner;
}

function TabBadge(): JSX.Element {
  return <span data-testid="badge">{reviewTab.useBadge?.()?.count ?? 'none'}</span>;
}

beforeEach(() => {
  vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: (_message: WebviewMessage) => undefined, getState: () => undefined, setState: <T,>(state: T) => state }));
  attachRepos([{ path: '.', name: 'qa-shop' }]);
});

afterEach(() => {
  cleanup();
  vi.mocked(listComments).mockReset();
  vi.mocked(resolveComment).mockReset();
  vi.mocked(listRepos).mockReset();
});

describe('ReviewTab approval blockers', () => {
  it('render_shouldShowOneCollapsedLine_whenThreadsBlockApproval', () => {
    loadState([root(1), root(2)]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    const banner = document.querySelector('.gw-review-blockers') as HTMLElement;
    expect(banner.textContent).toMatch(BLOCKERS_TITLE);
    expect(banner.querySelector('ul')).toBeNull();
    expect(banner.querySelector('.gw-collapsible-summary')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('expand_shouldListEveryThreadTheGuardCounts_includingResolvedOnesWithOpenResolution', async () => {
    loadState([root(1), root(2, { resolved: true }), root(3, { resolved: true, resolution: 'fixed' })]);
    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    const banner = expandBlockers();

    expect([...banner.querySelectorAll('li .gw-link')].map((link) => link.textContent)).toEqual(['app/a.py:1', 'app/a.py:2']);
    expect(banner.textContent).toContain('vsc.review.markedResolved');
    expect(banner.textContent).not.toContain('server');
    await waitFor(() => expect(document.getElementById('gw-review-thread-2')).toBeTruthy());
  });

  it('reopen_shouldUnresolveTheThread_whenMarkedResolvedButStillBlocking', async () => {
    vi.mocked(resolveComment).mockResolvedValue({});
    loadState([root(2, { resolved: true })]);
    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);
    const banner = expandBlockers();

    const reopen = screen.getByText('vsc.review.reopen', { selector: '.gw-review-blockers span' }).closest('button') as HTMLButtonElement;
    expect(reopen.title).toBe('vsc.review.stillBlockingHint');
    fireEvent.click(reopen);

    await waitFor(() => expect(resolveComment).toHaveBeenCalledWith(2, false));
    expect(banner.querySelectorAll('li')).toHaveLength(1);
  });

  it('blockerLink_shouldFocusAndFlashTheBlockingThread_whenClicked', async () => {
    loadState([root(1)]);
    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);
    await waitFor(() => expect(document.getElementById('gw-review-thread-1')).toBeTruthy());
    const thread = document.getElementById('gw-review-thread-1') as HTMLElement;
    thread.scrollIntoView = vi.fn();
    expandBlockers();

    fireEvent.click(screen.getByText('app/a.py:1', { selector: '.gw-review-blockers button' }));

    expect(document.activeElement).toBe(thread);
    expect(thread.classList.contains('gw-card-highlight')).toBe(true);
    thread.dispatchEvent(new Event('animationend'));
    expect(thread.classList.contains('gw-card-highlight')).toBe(false);
  });

  it('render_shouldHideBlockers_whenNoGateIsWaiting', () => {
    loadState([root(1)], { pending_gate: null });

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    expect(document.querySelector('.gw-review-blockers')).toBeNull();
  });
});

describe('ReviewTab addressed threads', () => {
  it('render_shouldGroupAgentAddressedThreadsApart_withAddressedBadgeAndCloseAction', async () => {
    loadState([root(1), root(4, { resolution: 'fixed' })]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(document.querySelector('.gw-review-group')).toBeTruthy());
    const group = document.querySelector('.gw-review-group') as HTMLElement;
    expect(group.querySelector('h3')?.textContent).toBe('vsc.review.addressedGroup');
    expect(group.querySelector('#gw-review-thread-4')).toBeTruthy();
    expect(group.querySelector('#gw-review-thread-1')).toBeNull();
    expect(group.textContent).toContain('vsc.review.addressedBy');
    expect(group.textContent).toContain('vsc.review.close');
    expect(group.textContent).not.toContain('vsc.common.resolve');
  });

  it('render_shouldKeepResolveAction_forThreadsStillOpen', async () => {
    loadState([root(1), root(4, { resolution: 'fixed' })]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(document.getElementById('gw-review-thread-1')).toBeTruthy());
    expect(document.getElementById('gw-review-thread-1')?.textContent).toContain('vsc.common.resolve');
    expect(document.querySelector('.gw-review-blockers')?.textContent).toMatch(BLOCKERS_TITLE);
  });
});

describe('ReviewTab empty state', () => {
  it('render_shouldExplainWhenThePipelineRuns_whenNoThreadsExist', async () => {
    loadState([]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(screen.getByText('vsc.review.pipelineHint')).toBeTruthy());
    expect(screen.getAllByText('review.noComments')).toHaveLength(1);
  });

  it('render_shouldOmitPipelineHint_whenOnlyResolvedThreadsAreHidden', async () => {
    loadState([root(5, { resolved: true, resolution: 'fixed' })]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(screen.getByText('review.noComments')).toBeTruthy());
    expect(screen.queryByText('vsc.review.pipelineHint')).toBeNull();
  });
});

describe('reviewTab badge', () => {
  it('useBadge_shouldUseTheGuardCount_whileTicketIsActive', () => {
    loadState([root(1), root(2, { resolved: true })]);

    render(<TabBadge />);

    expect(screen.getByTestId('badge').textContent).toBe('2');
  });

  it('useBadge_shouldHideCountAndBulkActions_whenTicketIsFinished', () => {
    loadState([root(1)], { phase: '5.1', pending_gate: null });

    render(<><TabBadge /><ReviewTab active nav={{ tab: 'review' } as NavTarget} /></>);

    expect(screen.getByTestId('badge').textContent).toBe('none');
    expect(screen.queryByText('vsc.review.bulkActions')).toBeNull();
  });
});

describe('ReviewTab blocking count', () => {
  it('render_shouldStateTheBlockingCountOnlyInTheBanner_andMarkOnlyTheThreadThatNeedsReopening', async () => {
    loadState([root(1), root(2), root(3, { resolved: true })]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(document.getElementById('gw-review-thread-3')).toBeTruthy());
    expect(screen.getAllByText(BLOCKERS_TITLE)).toHaveLength(1);
    expect(document.querySelector('.gw-review-threads')?.textContent).not.toMatch(/blockersTitle|blockingCount/);
    expect(screen.getAllByText('vsc.review.stillBlocking')).toHaveLength(1);
  });

  it('render_shouldShowAWarningMarkerWithOneReopenAction_whenResolvedThreadStillBlocks', async () => {
    vi.mocked(resolveComment).mockResolvedValue({});
    loadState([root(3, { resolved: true })]);
    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);
    await waitFor(() => expect(document.getElementById('gw-review-thread-3')).toBeTruthy());
    const thread = document.getElementById('gw-review-thread-3') as HTMLElement;

    const marker = thread.querySelector('.gw-thread-header .gw-review-still-blocking') as HTMLElement;
    expect(marker.querySelector('.gw-badge')?.textContent).toBe('vsc.review.stillBlocking');
    expect(marker.querySelector('.gw-badge')?.className).toContain('warning');
    expect(marker.querySelector('.gw-badge')?.className).not.toContain('danger');
    expect(screen.getAllByText('vsc.review.reopen', { selector: '.gw-thread span' })).toHaveLength(1);
    fireEvent.click(screen.getByText('vsc.review.reopen', { selector: '.gw-review-still-blocking span' }).closest('button') as HTMLButtonElement);

    await waitFor(() => expect(resolveComment).toHaveBeenCalledWith(3, false));
  });
});

describe('ReviewTab review-blocking anchor', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    act(() => store.navigate({ tab: 'review' }));
  });

  it('navigate_shouldExpandScrollAndFlashTheBlockerBanner_whenThreadsBlockApproval', async () => {
    loadState([root(1), root(2)]);
    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);
    const banner = document.querySelector('.gw-review-blockers') as HTMLElement;
    expect(banner.querySelector('ul')).toBeNull();

    act(() => store.navigate({ tab: 'review', anchor: 'review-blocking' }));

    expect(banner.id).toBe('review-blocking');
    await waitFor(() => expect(banner.classList.contains('gw-card-highlight')).toBe(true));
    expect(banner.querySelectorAll('li')).toHaveLength(2);
    await waitFor(() => expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(banner));
  });

  it('navigate_shouldLandOnTheThreadList_whenNothingBlocksApproval', async () => {
    loadState([root(1, { resolved: true, resolution: 'fixed' })]);
    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);
    await waitFor(() => expect(screen.getByText('review.noComments')).toBeTruthy());

    act(() => store.navigate({ tab: 'review', anchor: 'review-blocking' }));

    const target = document.getElementById('review-blocking') as HTMLElement;
    expect(document.querySelector('.gw-review-blockers')).toBeNull();
    expect(target.contains(screen.getByText('review.noComments'))).toBe(true);
    await waitFor(() => expect(target.classList.contains('gw-card-highlight')).toBe(true));
    await waitFor(() => expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(target));
  });
});

describe('ReviewTab repository groups', () => {
  const REPOS = [{ path: 'qa-api', name: 'qa-api' }, { path: 'qa-notifier', name: 'qa-notifier' }];

  it('render_shouldGroupThreadsUnderEachRepository_withTheirCount_whenWorkspaceHasSeveralRepositories', async () => {
    attachRepos(REPOS);
    loadState([root(1, { target: 'qa-notifier/send.py' }), root(2, { target: 'qa-api/a.py' }), root(3, { target: 'qa-api/b.py' }), root(4, { target: 'notes.md' })]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(document.querySelectorAll('.gw-review-repo')).toHaveLength(3));
    const sections = [...document.querySelectorAll('.gw-review-repo')];
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual(['qa-api', 'qa-notifier', 'vsc.review.outsideRepos']);
    expect(sections.map((section) => section.querySelector('.gw-review-repo__title .gw-badge')?.textContent)).toEqual(['2', '1', '1']);
    expect([...sections[0]!.querySelectorAll('.gw-review-thread-anchor')].map((thread) => thread.id)).toEqual(['gw-review-thread-2', 'gw-review-thread-3']);
  });

  it('render_shouldKeepAFlatList_whenWorkspaceHasOneRepository', async () => {
    loadState([root(1), root(2)]);

    render(<ReviewTab active nav={{ tab: 'review' } as NavTarget} />);

    await waitFor(() => expect(document.getElementById('gw-review-thread-2')).toBeTruthy());
    expect(document.querySelector('.gw-review-repo')).toBeNull();
  });
});
