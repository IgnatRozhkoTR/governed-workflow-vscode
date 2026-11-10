// @vitest-environment happy-dom
import type { WorkspaceState } from '@api-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import type { JSX } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_REPOS, type RepoChip } from '../../../webview-ui/src/tabs/changes/diffModel';
import { RepoChips } from '../../../webview-ui/src/tabs/changes/RepoChips';
import { useWorkspacePersistentState } from '../../../webview-ui/src/tabs/changes/useWorkspacePersistentState';
import { store } from '../../../webview-ui/src/store/store';

const CHIPS: readonly RepoChip[] = [
  { value: ALL_REPOS, name: 'All', fileCount: 4, threadCount: 2 },
  { value: 'qa-api', name: 'qa-api', fileCount: 2, threadCount: 1 },
  { value: 'qa-notifier', name: 'qa-notifier', fileCount: 2, threadCount: 0 },
];

let persisted: Record<string, unknown> = {};

function openWorkspace(branch: string): void {
  const state = { phase: '3.1', plan: {}, comments: {} } as unknown as WorkspaceState;
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'proj', branch }, state, etag: null } });
}

function radio(name: string): HTMLElement {
  return screen.getByRole('radio', { name: new RegExp(`^${name}`) });
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
  openWorkspace('feature/x');
});

afterEach(() => {
  cleanup();
});

describe('RepoChips', () => {
  it('render_shouldExposeARadioGroupWithFileAndThreadCounts', () => {
    render(<RepoChips chips={CHIPS} selected={ALL_REPOS} onSelect={vi.fn()} />);

    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(radio('All').getAttribute('aria-checked')).toBe('true');
    expect(radio('qa-api').textContent).toContain('vsc.changes.chipFiles');
    expect(radio('qa-api').textContent).toContain('vsc.changes.chipThreads');
    expect(radio('qa-notifier').textContent).not.toContain('vsc.changes.chipThreads');
  });

  it('render_shouldKeepOnlyTheSelectedChipInTabOrder', () => {
    render(<RepoChips chips={CHIPS} selected="qa-api" onSelect={vi.fn()} />);

    expect(radio('qa-api').tabIndex).toBe(0);
    expect(radio('All').tabIndex).toBe(-1);
  });

  it('keyDown_shouldSelectNextAndWrapAround_whenArrowKeysArePressed', () => {
    const onSelect = vi.fn();
    render(<RepoChips chips={CHIPS} selected="qa-notifier" onSelect={onSelect} />);

    fireEvent.keyDown(radio('qa-notifier'), { key: 'ArrowRight' });
    fireEvent.keyDown(radio('qa-notifier'), { key: 'ArrowLeft' });
    fireEvent.keyDown(radio('qa-notifier'), { key: 'Home' });

    expect(onSelect.mock.calls.map(([value]) => value)).toEqual([ALL_REPOS, 'qa-api', ALL_REPOS]);
  });

  it('click_shouldSelectTheChip', () => {
    const onSelect = vi.fn();
    render(<RepoChips chips={CHIPS} selected={ALL_REPOS} onSelect={onSelect} />);

    fireEvent.click(radio('qa-notifier'));

    expect(onSelect).toHaveBeenCalledWith('qa-notifier');
  });
});

function SavedRepo(): JSX.Element {
  const [repo, setRepo] = useWorkspacePersistentState('changes.repo', '');
  return <button type="button" data-testid="repo" onClick={() => setRepo('qa-api')}>{repo}</button>;
}

describe('useWorkspacePersistentState', () => {
  it('update_shouldPersistUnderTheWorkspaceKey', () => {
    render(<SavedRepo />);

    fireEvent.click(screen.getByTestId('repo'));

    expect(screen.getByTestId('repo').textContent).toBe('qa-api');
    expect(persisted).toEqual({ 'ui.changes.repo:proj/feature/x': 'qa-api' });
  });

  it('render_shouldReadEachWorkspacesOwnChoice_whenTheWorkspaceSwitches', async () => {
    persisted = { 'ui.changes.repo:proj/feature/x': 'qa-api', 'ui.changes.repo:proj/feature/y': 'qa-notifier' };
    render(<SavedRepo />);
    expect(screen.getByTestId('repo').textContent).toBe('qa-api');

    openWorkspace('feature/y');

    expect(await screen.findByText('qa-notifier')).toBeTruthy();
  });
});
