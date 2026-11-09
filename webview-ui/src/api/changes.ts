import type { DiffMode, DiffResponse } from '@api-types';
import { apiGet, apiPost, ws } from './request';

export interface RepoEntry {
  readonly path: string;
  readonly name: string;
}

export interface BranchEntry {
  readonly name: string;
  readonly ref: string;
  readonly current: boolean;
}

export interface HistoryCommit {
  readonly sha: string;
  readonly full_sha: string;
  readonly subject: string;
  readonly body: string;
  readonly author_name: string;
  readonly author_email: string;
  readonly author_date: string;
  readonly ahead_of_origin: boolean;
}

export interface HistoryResponse {
  readonly commits: readonly HistoryCommit[];
  readonly source_branch: string;
  readonly browsing?: boolean;
}

export interface DiffQuery {
  readonly mode: DiffMode;
  readonly commit?: string;
  readonly repo?: string;
  readonly base?: string;
}

export interface HistoryQuery {
  readonly ref?: string;
  readonly repo?: string;
}

export function listRepos(): Promise<{ repos: RepoEntry[] }> {
  return apiGet<{ repos: RepoEntry[] }>(ws('repos'));
}

export function getDiff(q: DiffQuery): Promise<DiffResponse> {
  return apiGet<DiffResponse>(ws('diff'), { mode: q.mode, commit: q.commit, repo: q.repo, base: q.base });
}

export function listBranches(repo?: string): Promise<{ branches: BranchEntry[] }> {
  return apiGet<{ branches: BranchEntry[] }>(ws('branches'), { repo });
}

export function getHistory(q: HistoryQuery): Promise<HistoryResponse> {
  return apiGet<HistoryResponse>(ws('history'), { ref: q.ref, repo: q.repo });
}

export function historyRename(sha: string, message: string): Promise<unknown> {
  return apiPost(ws('history/rename'), { sha, message });
}

export function historyUndo(): Promise<unknown> {
  return apiPost(ws('history/undo'), {});
}

export function historySquash(commits: readonly string[], message: string): Promise<unknown> {
  return apiPost(ws('history/squash'), { commits, message });
}
