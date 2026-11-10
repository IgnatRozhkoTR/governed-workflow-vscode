import type { RepoEntry } from '../api/changes';
import { getDiff, getHistory, listRepos } from '../api/changes';
import { getVerificationResults, isVerificationRun } from '../api/verification';
import { useT } from '../i18n/i18n';
import { runStatusLabel } from '../tabs/phase/statusLabel';
import { uncommittedInBranch } from '../tabs/changes/diffModel';
import { useResource, useStore, type Resource } from '../store/hooks';
import { findingsTally, type BranchFiles, type FindingsTally } from './gateDigestModel';

const NO_COMMENTS = {};

export interface VerificationStatus {
  // The last run's raw status, absent when verification never ran.
  readonly runStatus: string | undefined;
  readonly label: string;
}

// What a branch decision rests on, loaded once and shared by the decision bar and the ready-to-ship summary.
export function useBranchFiles(): Resource<BranchFiles> {
  return useResource('diff', 'digest.files', loadBranchFiles);
}

export function useChangedFileCount(): Resource<number> {
  const files = useBranchFiles();
  return { ...files, data: files.data?.total };
}

export function useBranchCommitCount(): Resource<number> {
  return useResource('history', 'digest.commits', countBranchCommits);
}

// The last run's status in the user's language, or "not run" when verification never ran.
export function useVerificationRunStatus(): Resource<VerificationStatus> {
  const t = useT();
  const results = useResource('verification', 'digest.results', () => getVerificationResults());
  const runStatus = results.data !== undefined && isVerificationRun(results.data) ? results.data.status : undefined;
  const label = runStatus === undefined ? t('vsc.digest.verificationNone') : runStatusLabel(t, runStatus);
  return { ...results, data: results.data === undefined ? undefined : { runStatus, label } };
}

export function useVerificationStatus(): Resource<string> {
  const status = useVerificationRunStatus();
  return { ...status, data: status.data?.label };
}

export function useFindingsTally(): FindingsTally {
  const comments = useStore((s) => s.state?.comments ?? NO_COMMENTS);
  return findingsTally(comments);
}

async function loadBranchFiles(): Promise<BranchFiles> {
  const { repos } = await listRepos();
  const perRepo = await Promise.all(repos.map(loadRepoFiles));
  return perRepo.reduce((sum, files) => ({ total: sum.total + files.total, uncommitted: sum.uncommitted + files.uncommitted }), { total: 0, uncommitted: 0 });
}

// Counted the way Code Changes counts its "in branch · uncommitted" split, so the two never disagree.
async function loadRepoFiles(repo: RepoEntry): Promise<BranchFiles> {
  const [branch, uncommitted] = await Promise.all([getDiff({ mode: 'branch', repo: repo.path }), getDiff({ mode: 'uncommitted', repo: repo.path })]);
  const uncommittedPaths = new Set(uncommitted.files.map((file) => file.path));
  return { total: branch.files.length, uncommitted: uncommittedInBranch(branch.files, uncommittedPaths, undefined) };
}

async function countBranchCommits(): Promise<number> {
  const { repos } = await listRepos();
  const counts = await Promise.all(repos.map(async (repo) => (await getHistory({ repo: repo.path })).commits.length));
  return counts.reduce((sum, count) => sum + count, 0);
}
