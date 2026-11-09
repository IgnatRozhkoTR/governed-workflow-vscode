import { apiDelete, apiGet, apiPost, apiPut, project, ws } from './request';

export interface AttachedRepo {
  readonly repo_id: number;
  readonly rel_path: string;
  readonly name: string;
  readonly branch: string | null;
  readonly worktree_path: string;
}

export interface AvailableRepo {
  readonly repo_id: number;
  readonly rel_path: string;
  readonly name: string;
  readonly base_branch: string | null;
}

export interface RepoState {
  readonly project_type: 'single' | 'multi';
  readonly attached: readonly AttachedRepo[];
  readonly available: readonly AvailableRepo[];
}

export interface WorkspacePr {
  readonly id: number;
  readonly repo_id: number | null;
  readonly url: string;
  readonly title: string | null;
  readonly rel_path: string | null;
  readonly name: string | null;
}

export interface NewPr {
  readonly url: string;
  readonly repo_id?: number;
  readonly title?: string;
}

export type GitProvider = 'local' | 'github' | 'gitlab';

export interface GitConfig {
  readonly provider: GitProvider;
  readonly host: string;
  readonly token: string;
  readonly default_branch: string;
}

export type GitRulesSource = 'project' | 'system-default' | 'not-configured';

export interface GitRules {
  readonly content: string;
  readonly source: GitRulesSource;
}

export interface RepoCandidate {
  readonly rel_path: string;
  readonly name: string;
  readonly current_branch: string | null;
}

export interface ConvertSelection {
  readonly rel_path: string;
  readonly base_branch: string;
}

export interface ProjectRepo {
  readonly id: number;
  readonly rel_path: string;
  readonly name: string;
  readonly base_branch: string | null;
  readonly enabled: boolean;
  readonly has_rules_override?: boolean;
  readonly git_rules_override?: string | null;
}

export interface ProjectRepoPatch {
  readonly base_branch?: string;
  readonly git_rules_override?: string | null;
}

export interface BaseSync {
  readonly updated?: boolean;
  readonly branch?: string;
  readonly reason?: string;
}

export interface AttachResult {
  readonly attached: AttachedRepo;
  readonly base_sync: BaseSync | null;
}

export function getRepoState(): Promise<RepoState> {
  return apiGet<RepoState>(ws('repo-state'));
}

export function listPrs(): Promise<{ prs: WorkspacePr[] }> {
  return apiGet<{ prs: WorkspacePr[] }>(ws('prs'));
}

export function addPr(pr: NewPr): Promise<unknown> {
  return apiPost(ws('prs'), pr);
}

export function deletePr(id: number): Promise<unknown> {
  return apiDelete(ws(`prs/${id}`));
}

export function getGitConfig(): Promise<GitConfig> {
  return apiGet<GitConfig>(project('git-config'));
}

export function saveGitConfig(config: GitConfig): Promise<unknown> {
  return apiPut(project('git-config'), config);
}

export function getGitRules(): Promise<GitRules> {
  return apiGet<GitRules>(project('git-rules'));
}

export function saveGitRules(content: string): Promise<unknown> {
  return apiPut(project('git-rules'), { content });
}

export function scanRepos(): Promise<{ candidates: RepoCandidate[] }> {
  return apiGet<{ candidates: RepoCandidate[] }>(project('repo-scan'));
}

export function convertMulti(repos: readonly ConvertSelection[]): Promise<{ project_type: string; repos: ProjectRepo[] }> {
  return apiPost<{ project_type: string; repos: ProjectRepo[] }>(project('convert-multi'), { repos });
}

export function listProjectRepos(): Promise<{ project_type: string; repos: ProjectRepo[] }> {
  return apiGet<{ project_type: string; repos: ProjectRepo[] }>(project('repos'));
}

export function getProjectRepo(id: number): Promise<ProjectRepo> {
  return apiGet<ProjectRepo>(project(`repos/${id}`));
}

export function updateProjectRepo(repoId: number, patch: ProjectRepoPatch): Promise<ProjectRepo> {
  return apiPut<ProjectRepo>(project(`repos/${repoId}`), patch);
}

export function attachRepo(repoId: number): Promise<AttachResult> {
  return apiPost<AttachResult>(ws('repos/attach'), { repo_id: repoId });
}
