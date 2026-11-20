import type { WorkspaceState } from '../api/types';

export function defaultBaseFor(state: WorkspaceState, repo: string | undefined): string | null {
  const repoBase = repo === undefined ? undefined : state.repo_base_branches?.[repo];
  return repoBase ?? state.source_branch;
}
