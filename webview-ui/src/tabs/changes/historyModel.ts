import type { HistoryCommit } from '../../api/changes';

export function isSelectionContiguous(selected: readonly string[], commits: readonly HistoryCommit[]): boolean {
  if (selected.length < 2) {
    return false;
  }
  const indices = selected.map((sha) => commits.findIndex((commit) => commit.full_sha === sha)).sort((a, b) => a - b);
  if (indices[0] === -1) {
    return false;
  }
  return indices.every((index, position) => position === 0 || index === (indices[position - 1] as number) + 1);
}

export function selectedCommitsInOrder(selected: readonly string[], commits: readonly HistoryCommit[]): readonly HistoryCommit[] {
  return commits.filter((commit) => selected.includes(commit.full_sha));
}

export function canSquash(selected: readonly string[], commits: readonly HistoryCommit[]): boolean {
  const picked = selectedCommitsInOrder(selected, commits);
  return picked.length === selected.length && picked.every((commit) => commit.ahead_of_origin) && isSelectionContiguous(selected, commits);
}

export function canUndo(commits: readonly HistoryCommit[]): boolean {
  return commits[0]?.ahead_of_origin === true;
}

export function renameTarget(commits: readonly HistoryCommit[], activeSha: string | undefined): HistoryCommit | undefined {
  return commits.find((commit) => commit.full_sha === activeSha) ?? commits[0];
}

export function canRename(commits: readonly HistoryCommit[], activeSha: string | undefined): boolean {
  return renameTarget(commits, activeSha)?.ahead_of_origin === true;
}

export function fullMessage(commit: HistoryCommit): string {
  return commit.body === '' ? commit.subject : `${commit.subject}\n\n${commit.body}`;
}

export function defaultSquashMessage(picked: readonly HistoryCommit[]): string {
  return picked.map((commit) => commit.subject).join('\n\n');
}

export function toggleSelection(selected: readonly string[], sha: string): readonly string[] {
  return selected.includes(sha) ? selected.filter((item) => item !== sha) : [...selected, sha];
}
