import type { BaseSync, ConvertSelection, ProjectRepo, RepoCandidate } from '../../../../api/git';

const DEFAULT_BASE_BRANCH = 'develop';
const MAX_URL_LENGTH = 60;
const TRIVIAL_SYNC_REASONS: readonly string[] = ['no-local-branch', 'not-remote-based'];

export type ConvertMode = 'convert' | 'edit';

export interface ConvertRow {
  readonly relPath: string;
  readonly name: string;
  readonly checked: boolean;
  readonly baseBranch: string;
}

export type BaseSyncNotice =
  | { readonly kind: 'updated'; readonly branch: string }
  | { readonly kind: 'notUpdated'; readonly branch: string; readonly reason: string };

export function buildConvertRows(candidates: readonly RepoCandidate[], registry: readonly ProjectRepo[], mode: ConvertMode): readonly ConvertRow[] {
  const registryByPath = new Map(registry.map((repo) => [repo.rel_path, repo]));
  const rows: ConvertRow[] = candidates.map((candidate) => {
    const registered = registryByPath.get(candidate.rel_path);
    return {
      relPath: candidate.rel_path,
      name: candidate.name,
      checked: mode === 'edit' ? registered?.enabled === true : true,
      baseBranch: (registered ? registered.base_branch : candidate.current_branch) ?? '',
    };
  });
  if (mode === 'convert') {
    return rows;
  }
  const seen = new Set(candidates.map((candidate) => candidate.rel_path));
  const orphans = registry
    .filter((repo) => !seen.has(repo.rel_path))
    .map((repo): ConvertRow => ({ relPath: repo.rel_path, name: repo.name, checked: repo.enabled, baseBranch: repo.base_branch ?? '' }));
  return [...rows, ...orphans];
}

export function selectionFrom(rows: readonly ConvertRow[]): readonly ConvertSelection[] {
  return rows.filter((row) => row.checked).map((row) => ({ rel_path: row.relPath, base_branch: row.baseBranch.trim() || DEFAULT_BASE_BRANCH }));
}

export function shortenUrl(url: string): string {
  const stripped = url.replace(/^https?:\/\//, '');
  return stripped.length > MAX_URL_LENGTH ? `${stripped.slice(0, MAX_URL_LENGTH - 3)}…` : stripped;
}

export function baseSyncNotice(baseSync: BaseSync | null | undefined, fallbackBranch: string | null | undefined): BaseSyncNotice | undefined {
  if (!baseSync) {
    return undefined;
  }
  const branch = baseSync.branch ?? fallbackBranch ?? '';
  if (baseSync.updated) {
    return { kind: 'updated', branch };
  }
  const reason = baseSync.reason ?? '';
  return TRIVIAL_SYNC_REASONS.includes(reason) ? undefined : { kind: 'notUpdated', branch, reason };
}
