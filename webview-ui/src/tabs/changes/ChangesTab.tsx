import type { DiffFile, DiffResponse } from '@api-types';
import type { DiffSource } from '@shared/protocol';
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { getDiff, getHistory, listBranches, listRepos, type HistoryResponse } from '../../api/changes';
import { Badge, Button, EmptyState, IconButton, ResourceView, Select, Tabs, TextField, Toolbar, useToast } from '../../components';
import { useT } from '../../i18n/i18n';
import { openCount } from '../../lib/comments';
import { rpc } from '../../rpc/rpcClient';
import { useNav, usePersistentState, useResource, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { diffErrorCode, filterFiles, nativeRepo, resolveRepo, toDiffFileRef } from './diffModel';
import { FileList, type FileView } from './FileList';
import { HistoryPanel } from './HistoryPanel';

type SourceMode = 'branch' | 'uncommitted' | 'commit';

const EMPTY_DIFF: DiffResponse = { files: [], mode: 'commit' };
const EMPTY_HISTORY: HistoryResponse = { commits: [], source_branch: '' };

export function ChangesTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const toast = useToast();
  const state = useWorkspaceState();
  const [, navigate] = useNav();
  const [source, setSource] = usePersistentState<SourceMode>('changes.source', 'branch');
  const [fileView, setFileView] = usePersistentState<FileView>('changes.fileView', 'tree');
  const [savedRepo, setSavedRepo] = usePersistentState('changes.repo', '');
  const [base, setBase] = usePersistentState('changes.base', '');
  const [filter, setFilter] = useState('');
  const [commit, setCommit] = useState<string | undefined>(undefined);
  const [historyRef, setHistoryRef] = useState<string | undefined>(undefined);

  const repos = useResource('git', 'changes.repos', listRepos, { active, refetchOnState: false });
  const repoList = repos.data?.repos ?? [];
  const repo = resolveRepo(repoList.map((entry) => entry.path), savedRepo);
  const isRepoReady = repos.data !== undefined;
  const branches = useResource('history', `branches|${repo}`, () => listBranches(repo), { active: active && isRepoReady, refetchOnState: false });
  const branchList = branches.data?.branches ?? [];
  const resolvedBase = branchList.some((branch) => branch.name === base) ? base : '';
  const isCommitMode = source === 'commit';

  const history = useResource('history', `history|${repo}|${historyRef ?? ''}`, () => getHistory({ ref: historyRef, repo }), {
    active: active && isRepoReady && isCommitMode,
  });
  const commits = history.data?.commits ?? EMPTY_HISTORY.commits;
  useEffect(() => {
    const isStale = commit === undefined || (historyRef === undefined && !commits.some((entry) => entry.full_sha === commit));
    if (isCommitMode && isStale && commits[0] !== undefined) {
      setCommit(commits[0].full_sha);
    }
  }, [isCommitMode, commit, commits, historyRef]);

  const diffKey = `${source}|${commit ?? ''}|${repo}|${resolvedBase}`;
  const diff = useResource<DiffResponse>('diff', diffKey, () => loadDiff(source, commit, repo, resolvedBase), { active: active && isRepoReady });
  const visibleFiles = useMemo(() => filterFiles(diff.data?.files ?? [], filter), [diff.data, filter]);
  const filesWithOpenComments = (diff.data?.files ?? []).filter((file) => openCount(state, 'review', file.path) > 0).length;

  const nativeSource = (): DiffSource => ({
    mode: source,
    base: source === 'branch' ? (diff.data?.base ?? (resolvedBase || undefined)) : undefined,
    commit: source === 'commit' ? commit : undefined,
    repo: nativeRepo(repo),
  });
  const runNative = (action: () => Promise<unknown>): void => {
    action().catch((error: unknown) => toast.error(error));
  };
  const openDiff = (file: DiffFile): void => runNative(() => rpc.call('native.openDiff', { source: nativeSource(), file: toDiffFileRef(file) }));
  const openAll = (): Promise<void> => rpc.call('native.openAllChanges', { source: nativeSource(), files: visibleFiles.map(toDiffFileRef) });
  const openFile = (file: DiffFile): void => runNative(() => rpc.call('native.openFile', { path: file.path, repo: nativeRepo(repo) }));

  const selectRepo = (path: string): void => {
    setSavedRepo(path);
    setCommit(undefined);
    setHistoryRef(undefined);
  };
  const selectSource = (next: string): void => setSource(next as SourceMode);
  const selectHistoryRef = (ref: string | undefined): void => {
    setHistoryRef(ref);
    setCommit(undefined);
  };
  const translatedDiff = { ...diff, error: translateDiffError(diff.error, t) };

  return (
    <div class="gw-changes">
      <Toolbar align="between">
        <div class="gw-changes-controls">
          {repoList.length > 1 && <Select value={repo} options={repoList.map((entry) => ({ value: entry.path, label: entry.name }))} onChange={selectRepo} />}
          <Tabs
            variant="sub"
            activeId={source}
            onChange={selectSource}
            items={[
              { id: 'branch', label: t('diff.branch') },
              { id: 'uncommitted', label: t('diff.uncommitted') },
              { id: 'commit', label: t('diff.commit') },
            ]}
          />
          {source === 'branch' && (
            <Select
              value={resolvedBase}
              options={[{ value: '', label: t('diff.baseDefault') }, ...branchList.map((branch) => ({ value: branch.name, label: branch.name }))]}
              onChange={setBase}
            />
          )}
        </div>
        <div class="gw-changes-controls">
          <IconButton icon="list-tree" title={t('diff.tree')} tone={fileView === 'tree' ? 'accent' : undefined} onClick={() => setFileView('tree')} />
          <IconButton icon="list-flat" title={t('diff.list')} tone={fileView === 'list' ? 'accent' : undefined} onClick={() => setFileView('list')} />
        </div>
      </Toolbar>

      <Toolbar align="between">
        <div class="gw-changes-filter">
          <TextField value={filter} onInput={setFilter} placeholder={t('diff.filterFiles')} />
        </div>
        <div class="gw-changes-controls">
          <Badge tone="neutral" label={t('badges.filesChanged', { count: diff.data?.files.length ?? 0 })} />
          {filesWithOpenComments > 0 && (
            <Button size="sm" variant="ghost" icon="comment-discussion" label={`${t('vsc.changes.showThreads')} (${t('vsc.changes.unresolvedCount', { count: filesWithOpenComments })})`} onClick={() => navigate({ tab: 'review' })} />
          )}
          <Button size="sm" variant="secondary" icon="files" label={t('vsc.changes.openAll')} disabled={visibleFiles.length === 0} onClick={openAll} />
        </div>
      </Toolbar>

      {isRepoReady && repoList.length === 0 ? (
        <EmptyState icon="repo" message={t('diff.repoRequired')} />
      ) : (
        <ResourceView resource={translatedDiff}>
          {() =>
            isCommitMode && commit === undefined ? (
              <EmptyState icon="git-commit" message={t('vsc.changes.pickCommit')} />
            ) : (
              <FileList files={visibleFiles} view={fileView} hasFilter={filter.trim() !== ''} onOpenDiff={openDiff} onOpenFile={openFile} />
            )
          }
        </ResourceView>
      )}

      {isCommitMode && (
        <HistoryPanel commits={commits} branches={branchList} activeRef={historyRef} activeCommit={commit} onSelectRef={selectHistoryRef} onSelectCommit={setCommit} />
      )}
    </div>
  );
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
