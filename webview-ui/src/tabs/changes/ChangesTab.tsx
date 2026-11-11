import type { DiffFile, DiffResponse } from '@api-types';
import type { DiffSource } from '@shared/protocol';
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getDiff, getHistory, listBranches, listRepos, type HistoryResponse, type RepoEntry } from '../../api/changes';
import { Badge, EmptyState, ResourceView, Select, Tabs, TextField, Toolbar, useToast } from '../../components';
import { useT } from '../../i18n/i18n';
import { rpc } from '../../rpc/rpcClient';
import { joinRepoPath } from '@shared/paths';
import { usePersistentState, useResource, useWorkspaceState } from '../../store/hooks';
import { blockingRoots } from '../review/reviewBlocking';
import type { TabProps } from '../types';
import {
  ALL_REPOS,
  baseOptions,
  blockersInRepo,
  changesCountLabel,
  defaultBaseName,
  diffErrorCode,
  filterFiles,
  nativeRepo,
  repoChips,
  resolveRepo,
  selectableBases,
  toDiffFileRef,
  uncommittedInBranch,
  type ChangeCounts,
  type RepoDiff,
  type SourceMode,
} from './diffModel';
import { ChangesOverflow } from './ChangesOverflow';
import { FileList, type FileView } from './FileList';
import { HistoryPanel } from './HistoryPanel';
import { RepoChips } from './RepoChips';
import { RepoGroups } from './RepoGroups';
import { loadRepoHistories, RepoHistoryGroups } from './RepoHistoryGroups';
import { useWorkspacePersistentState } from './useWorkspacePersistentState';

type WorkingTreeMode = Exclude<SourceMode, 'commit'>;

const EMPTY_DIFF: DiffResponse = { files: [], mode: 'commit' };
const EMPTY_HISTORY: HistoryResponse = { commits: [], source_branch: '' };
const NO_PATHS: ReadonlySet<string> = new Set();

export function ChangesTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const toast = useToast();
  const state = useWorkspaceState();
  const [source, setSource] = usePersistentState<SourceMode>('changes.source', 'branch');
  const [fileView, setFileView] = usePersistentState<FileView>('changes.fileView', 'tree');
  const [savedRepo, setSavedRepo] = useWorkspacePersistentState('changes.repo', '');
  const [base, setBase] = usePersistentState('changes.base', '');
  const [filter, setFilter] = useState('');
  const [isThreadsShown, setThreadsShown] = usePersistentState('changes.threadsShown', false);
  const [commit, setCommit] = useState<string | undefined>(undefined);
  const [historyRef, setHistoryRef] = useState<string | undefined>(undefined);

  const repos = useResource('git', 'changes.repos', listRepos, { active, refetchOnState: false });
  const repoList = repos.data?.repos ?? [];
  const selectedRepo = resolveRepo(repoList.map((entry) => entry.path), savedRepo);
  const isAllRepos = selectedRepo === ALL_REPOS;
  const repo = isAllRepos ? '' : selectedRepo;
  const isRepoReady = repos.data !== undefined;
  const hasNoRepos = isRepoReady && repoList.length === 0;
  const branches = useResource('history', `branches|${repo}`, () => listBranches(repo), { active: active && isRepoReady && !isAllRepos, refetchOnState: false });
  const branchList = branches.data?.branches ?? [];
  const bases = selectableBases(branchList, state.source_branch);
  const resolvedBase = bases.includes(base) ? base : '';
  const isAllCommits = isAllRepos && source === 'commit';
  const diffSource: SourceMode = isAllCommits ? 'branch' : source;
  const isCommitMode = diffSource === 'commit';
  const summarySource: WorkingTreeMode = diffSource === 'commit' ? 'branch' : diffSource;
  const repoDiffs = useResource('diff', `repos|${summarySource}`, () => loadRepoDiffs(repoList, summarySource), { active: active && repoList.length > 1 });
  const blockers = blockingRoots(state);
  const splitRepos = isAllRepos ? repoList : repoList.filter((entry) => entry.path === repo);
  const uncommitted = useResource('diff', `uncommitted|${splitRepos.map((entry) => entry.path).join(',')}`, () => loadUncommittedPaths(splitRepos), {
    active: active && isRepoReady && diffSource === 'branch',
  });

  const history = useResource('history', `history|${repo}|${historyRef ?? ''}`, () => getHistory({ ref: historyRef, repo }), {
    active: active && isRepoReady && isCommitMode,
  });
  const commits = history.data?.commits ?? EMPTY_HISTORY.commits;
  // With no commit to pick there is no diff to filter or show, so the history's own empty state is all the tab says.
  const hasNoCommits = isCommitMode && history.data !== undefined && commits.length === 0;
  const allHistories = useResource('history', `history|all|${repoList.map((entry) => entry.path).join(',')}`, () => loadRepoHistories(repoList), {
    active: active && isAllCommits,
  });
  useEffect(() => {
    const isStale = commit === undefined || (historyRef === undefined && !commits.some((entry) => entry.full_sha === commit));
    if (isCommitMode && !history.loading && isStale && commits[0] !== undefined) {
      setCommit(commits[0].full_sha);
    }
  }, [isCommitMode, history.loading, commit, commits, historyRef]);

  const diffKey = `${diffSource}|${commit ?? ''}|${repo}|${resolvedBase}`;
  const diff = useResource<DiffResponse>('diff', diffKey, () => loadDiff(diffSource, commit, repo, resolvedBase), { active: active && isRepoReady && !isAllRepos });
  const visibleFiles = useMemo(() => filterFiles(diff.data?.files ?? [], filter), [diff.data, filter]);
  const isFiltered = filter.trim() !== '';
  const allRepoFiles = useMemo(() => (repoDiffs.data ?? []).map((entry) => ({ entry, files: filterFiles(entry.files, filter) })), [repoDiffs.data, filter]);
  const uncommittedPaths = uncommitted.data ?? NO_PATHS;
  const filesLabel = changesCountLabel(t, isAllRepos
    ? allReposCounts(diffSource, allRepoFiles, uncommittedPaths)
    : { mode: diffSource, shown: visibleFiles.length, total: diff.data?.files.length ?? 0, uncommittedInBranch: uncommittedInBranch(diff.data?.files ?? [], uncommittedPaths, nativeRepo(repo)) });
  const defaultBase = defaultBaseName(resolvedBase, diff.data?.base, state.source_branch);
  const hasBlockingThreads = blockersInRepo(blockers, selectedRepo).length > 0;

  const nativeSource = (repoPath: string, loadedBase: string | undefined): DiffSource => ({
    mode: diffSource,
    base: diffSource === 'branch' ? (loadedBase ?? (resolvedBase || undefined)) : undefined,
    commit: isCommitMode ? commit : undefined,
    repo: nativeRepo(repoPath),
  });
  const runNative = (action: () => Promise<unknown>): void => {
    action().catch((error: unknown) => toast.error(error));
  };
  const openDiffIn = (repoPath: string, loadedBase: string | undefined, file: DiffFile): void =>
    runNative(() => rpc.call('native.openDiff', { source: nativeSource(repoPath, loadedBase), file: toDiffFileRef(file) }));
  const openFileIn = (repoPath: string, file: DiffFile): void => runNative(() => rpc.call('native.openFile', { path: file.path, repo: nativeRepo(repoPath) }));
  const openDiff = (file: DiffFile): void => openDiffIn(repo, diff.data?.base, file);
  const openFile = (file: DiffFile): void => openFileIn(repo, file);
  const openAll = async (): Promise<void> => {
    if (!isAllRepos) {
      await rpc.call('native.openAllChanges', { source: nativeSource(repo, diff.data?.base), files: visibleFiles.map(toDiffFileRef) });
      return;
    }
    for (const group of allRepoFiles.filter((candidate) => candidate.files.length > 0)) {
      await rpc.call('native.openAllChanges', { source: nativeSource(group.entry.path, group.entry.base), files: group.files.map(toDiffFileRef) });
    }
  };
  const visibleCount = isAllRepos ? sumBy(allRepoFiles, (group) => group.files.length) : visibleFiles.length;

  const selectRepo = (path: string): void => {
    setSavedRepo(path);
    setCommit(undefined);
    setHistoryRef(undefined);
  };
  const selectSource = (next: string): void => setSource(next as SourceMode);
  const selectRepoCommit = (repoPath: string, sha: string): void => {
    setSavedRepo(repoPath);
    setHistoryRef(undefined);
    setCommit(sha);
  };
  const selectHistoryRef = (ref: string | undefined): void => {
    setHistoryRef(ref);
    setCommit(undefined);
  };
  const translatedDiff = { ...diff, error: translateDiffError(diff.error, t) };

  return (
    <div class="gw-changes">
      {repoList.length > 1 && (
        <RepoChips chips={repoChips(t('vsc.changes.allReposChip'), repoList, repoDiffs.data, blockers)} selected={selectedRepo} onSelect={selectRepo} />
      )}
      <Toolbar align="between">
        <Tabs
          variant="sub"
          activeId={source}
          onChange={selectSource}
          items={[
            { id: 'branch', label: t('vsc.changes.source.branch') },
            { id: 'uncommitted', label: t('vsc.changes.source.uncommitted') },
            { id: 'commit', label: t('diff.commit') },
          ]}
        />
        <Tabs
          variant="sub"
          activeId={fileView}
          onChange={(next) => setFileView(next as FileView)}
          items={[
            { id: 'tree', label: t('vsc.changes.view.tree'), icon: 'list-tree' },
            { id: 'list', label: t('vsc.changes.view.list'), icon: 'list-flat' },
          ]}
        />
      </Toolbar>

      {!isAllCommits && !hasNoCommits && (
        <Toolbar align="between">
          <div class="gw-changes-controls gw-changes-filterbar">
            {diffSource === 'branch' && !isAllRepos && (
              <Select title={t('diff.diffAgainst')} value={resolvedBase} options={baseOptions(t, bases, defaultBase)} onChange={setBase} />
            )}
            <div class="gw-changes-filter">
              <TextField value={filter} onInput={setFilter} placeholder={t('diff.filterFiles')} />
            </div>
          </div>
          <div class="gw-changes-controls">
            <Badge tone="neutral" label={filesLabel} />
            <ChangesOverflow
              hasThreads={hasBlockingThreads}
              isThreadsShown={isThreadsShown}
              canOpenAll={visibleCount > 0}
              onToggleThreads={() => setThreadsShown(!isThreadsShown)}
              onOpenAll={openAll}
            />
          </div>
        </Toolbar>
      )}

      {hasNoRepos && <EmptyState icon="repo" message={t('diff.repoRequired')} />}
      {isAllCommits && (
        <ResourceView resource={allHistories}>
          {(loaded) => <RepoHistoryGroups histories={loaded} onSelectCommit={selectRepoCommit} />}
        </ResourceView>
      )}
      {isAllRepos && !isAllCommits && (
        <ResourceView resource={repoDiffs}>
          {(loaded) => (
            <RepoGroups
              repoDiffs={loaded}
              filter={filter}
              view={fileView}
              isThreadsShown={isThreadsShown}
              onOpenDiff={(entry, file) => openDiffIn(entry.path, entry.base, file)}
              onOpenFile={(entry, file) => openFileIn(entry.path, file)}
            />
          )}
        </ResourceView>
      )}
      {!hasNoRepos && !isAllRepos && !hasNoCommits && (
        <ResourceView resource={translatedDiff}>
          {() =>
            isCommitMode && commit === undefined ? (
              <EmptyState icon="git-commit" message={t('vsc.changes.pickCommit')} />
            ) : (
              <FileList files={visibleFiles} view={fileView} hasFilter={isFiltered} repo={nativeRepo(repo)} isThreadsShown={isThreadsShown} onOpenDiff={openDiff} onOpenFile={openFile} />
            )
          }
        </ResourceView>
      )}

      {isCommitMode && (
        <HistoryPanel
          commits={commits}
          branches={branchList}
          activeRef={historyRef}
          activeCommit={commit}
          canRewrite={!isAllRepos}
          repo={repo}
          onSelectRef={selectHistoryRef}
          onSelectCommit={setCommit}
        />
      )}
    </div>
  );
}

function sumBy<T>(items: readonly T[], count: (item: T) => number): number {
  return items.reduce((total, item) => total + count(item), 0);
}

function allReposCounts(mode: SourceMode, groups: readonly { entry: RepoDiff; files: readonly DiffFile[] }[], uncommittedPaths: ReadonlySet<string>): ChangeCounts {
  return {
    mode,
    shown: sumBy(groups, (group) => group.files.length),
    total: sumBy(groups, (group) => group.entry.files.length),
    uncommittedInBranch: sumBy(groups, (group) => uncommittedInBranch(group.entry.files, uncommittedPaths, nativeRepo(group.entry.path))),
  };
}

async function loadUncommittedPaths(repos: readonly RepoEntry[]): Promise<ReadonlySet<string>> {
  const responses = await Promise.all(repos.map(async (entry) => ({ entry, response: await getDiff({ mode: 'uncommitted', repo: entry.path }) })));
  return new Set(responses.flatMap(({ entry, response }) => response.files.map((file) => joinRepoPath(nativeRepo(entry.path), file.path))));
}

async function loadRepoDiffs(repos: readonly RepoEntry[], mode: WorkingTreeMode): Promise<RepoDiff[]> {
  return Promise.all(repos.map(async (entry) => {
    const response = await getDiff({ mode, repo: entry.path });
    return { path: entry.path, name: entry.name, files: response.files, base: response.base };
  }));
}

async function loadDiff(source: SourceMode, commit: string | undefined, repo: string, base: string): Promise<DiffResponse> {
  if (source === 'commit' && commit === undefined) {
    return EMPTY_DIFF;
  }
  return getDiff({ mode: source, commit: source === 'commit' ? commit : undefined, repo: repo === '' ? undefined : repo, base: source === 'branch' && base !== '' ? base : undefined });
}

function translateDiffError(error: unknown, t: (key: string) => string): unknown {
  switch (diffErrorCode(error)) {
    case 'base_ref_not_found':
      return new Error(t('diff.baseNotFound'));
    case 'repo_required':
    case 'repo_not_found':
      return new Error(t('diff.repoRequired'));
    default:
      return error;
  }
}
