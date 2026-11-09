import { describe, expect, it } from 'vitest';
import type { HistoryCommit } from '../../../webview-ui/src/api/changes';
import { canRename, canSquash, canUndo, defaultSquashMessage, fullMessage, isSelectionContiguous, selectedCommitsInOrder, toggleSelection } from '../../../webview-ui/src/tabs/changes/historyModel';

function commit(sha: string, ahead: boolean, overrides: Partial<HistoryCommit> = {}): HistoryCommit {
  return { sha, full_sha: sha, subject: `subject ${sha}`, body: '', author_name: 'a', author_email: 'a@x', author_date: '2026-11-09T10:00:00', ahead_of_origin: ahead, ...overrides };
}

const COMMITS = [commit('c1', true), commit('c2', true), commit('c3', true), commit('c4', false)];

describe('isSelectionContiguous', () => {
  it('accepts adjacent commits regardless of click order', () => {
    expect(isSelectionContiguous(['c2', 'c1'], COMMITS)).toBe(true);
  });

  it('rejects gaps, singletons and unknown commits', () => {
    expect(isSelectionContiguous(['c1', 'c3'], COMMITS)).toBe(false);
    expect(isSelectionContiguous(['c1'], COMMITS)).toBe(false);
    expect(isSelectionContiguous(['c1', 'zz'], COMMITS)).toBe(false);
  });
});

describe('canSquash', () => {
  it('requires contiguous, unpushed commits', () => {
    expect(canSquash(['c1', 'c2'], COMMITS)).toBe(true);
    expect(canSquash(['c3', 'c4'], COMMITS)).toBe(false);
    expect(canSquash(['c1', 'c3'], COMMITS)).toBe(false);
  });
});

describe('canUndo and canRename', () => {
  it('allows undo only when HEAD is unpushed', () => {
    expect(canUndo(COMMITS)).toBe(true);
    expect(canUndo([commit('p', false)])).toBe(false);
    expect(canUndo([])).toBe(false);
  });

  it('renames the active commit, falling back to HEAD', () => {
    expect(canRename(COMMITS, 'c4')).toBe(false);
    expect(canRename(COMMITS, 'c2')).toBe(true);
    expect(canRename(COMMITS, undefined)).toBe(true);
  });
});

describe('messages and selection', () => {
  it('joins subject and body for the rename prompt', () => {
    expect(fullMessage(commit('c1', true, { body: 'details' }))).toBe('subject c1\n\ndetails');
    expect(fullMessage(commit('c1', true))).toBe('subject c1');
  });

  it('builds the squash message from newest to oldest subjects', () => {
    expect(defaultSquashMessage(selectedCommitsInOrder(['c2', 'c1'], COMMITS))).toBe('subject c1\n\nsubject c2');
  });

  it('toggles selection membership', () => {
    expect(toggleSelection(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleSelection(['a', 'b'], 'a')).toEqual(['b']);
  });
});
