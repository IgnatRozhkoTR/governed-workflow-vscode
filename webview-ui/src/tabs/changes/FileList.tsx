import type { DiffFile, ReviewComment } from '@api-types';
import { joinRepoPath } from '@shared/paths';
import { Fragment, type JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { CommentIcon, EmptyState, Icon, IconButton } from '../../components';
import { useT } from '../../i18n/i18n';
import { REVIEW_SCOPE, rootsWithReplies } from '../../lib/comments';
import { useStore, useWorkspaceState } from '../../store/hooks';
import { ReviewThreadItem } from '../review/ReviewThreadItem';
import { blockingCountsByTarget, isBlockingRoot } from '../review/reviewBlocking';
import { buildFileTree, CHANGE_LETTERS, changeKindOf, fileLabel, flattenTree, type DirRow as DirTreeRow, type TreeRow } from './diffModel';

export type FileView = 'tree' | 'list';

export interface FileListProps {
  readonly files: readonly DiffFile[];
  readonly view: FileView;
  readonly hasFilter: boolean;
  readonly repo: string | undefined;
  readonly isThreadsShown?: boolean;
  readonly onOpenDiff: (file: DiffFile) => void;
  readonly onOpenFile: (file: DiffFile) => void;
}

const INDENT_PX = 14;
const ROW_PADDING_PX = 6;
const NO_COUNTS: ReadonlyMap<string, number> = new Map();

export function FileList({ files, view, hasFilter, repo, isThreadsShown = false, onOpenDiff, onOpenFile }: FileListProps): JSX.Element {
  const t = useT();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const comments = useStore((s) => s.state?.comments);
  const threadCounts = useMemo(() => (comments === undefined ? NO_COUNTS : blockingCountsByTarget({ comments })), [comments]);
  const countAt = (path: string): number => threadCounts.get(joinRepoPath(repo, path)) ?? 0;
  const rows = useMemo<readonly TreeRow[]>(() => {
    if (view === 'list') {
      return files.map((file) => ({ type: 'file', name: file.path, file, depth: 0 }));
    }
    return flattenTree(buildFileTree(files), collapsed);
  }, [files, view, collapsed]);

  if (files.length === 0) {
    return <EmptyState icon="diff" message={hasFilter ? t('vsc.changes.noMatches') : t('vsc.changes.noFiles')} />;
  }
  const toggleDir = (path: string): void => {
    const next = new Set(collapsed);
    if (!next.delete(path)) {
      next.add(path);
    }
    setCollapsed(next);
  };
  return (
    <div class="gw-changes-files" role="tree">
      {rows.map((row) =>
        row.type === 'dir' ? (
          <Fragment key={`dir:${row.path}`}>
            <DirRow row={row} repo={repo} threadCount={dirThreadCount(row, countAt)} onToggle={toggleDir} />
            {isThreadsShown && <InlineThreads target={joinRepoPath(repo, row.path)} depth={row.depth} />}
          </Fragment>
        ) : (
          <Fragment key={`file:${row.file.path}`}>
            <FileRowView row={row} repo={repo} threadCount={countAt(row.file.path)} isListView={view === 'list'} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} />
            {isThreadsShown && <InlineThreads target={joinRepoPath(repo, row.file.path)} depth={row.depth} />}
          </Fragment>
        ),
      )}
    </div>
  );
}

// An expanded folder shows only its own threads, since its files show theirs; a collapsed one rolls up its whole subtree.
function dirThreadCount(row: DirTreeRow, countAt: (path: string) => number): number {
  const paths = row.isCollapsed ? row.subtreePaths : [row.path];
  return paths.reduce((total, path) => total + countAt(path), 0);
}

function ThreadCount({ count }: { readonly count: number }): JSX.Element | null {
  const t = useT();
  if (count === 0) {
    return null;
  }
  const label = t('vsc.changes.blockingCount', { count });
  return (
    <span class="gw-changes-thread-count" title={label} aria-label={label}>
      <Icon name="comment-unresolved" />
      {count}
    </span>
  );
}

function useBlockingThreads(target: string): readonly ReviewComment[] {
  return rootsWithReplies(useWorkspaceState(), REVIEW_SCOPE, target).filter(isBlockingRoot);
}

// Shown under a row only while it has threads that block approval; each carries the same context as on the Review tab.
function InlineThreads({ target, depth }: { readonly target: string; readonly depth: number }): JSX.Element | null {
  const threads = useBlockingThreads(target);
  if (threads.length === 0) {
    return null;
  }
  return (
    <div class="gw-changes-threads" role="group" style={{ marginLeft: `${depth * INDENT_PX + ROW_PADDING_PX + INDENT_PX}px` }}>
      {threads.map((comment) => <ReviewThreadItem key={comment.id} comment={comment} />)}
    </div>
  );
}

interface DirRowProps {
  readonly row: DirTreeRow;
  readonly repo: string | undefined;
  readonly threadCount: number;
  readonly onToggle: (path: string) => void;
}

function DirRow({ row, repo, threadCount, onToggle }: DirRowProps): JSX.Element {
  return (
    <div class="gw-changes-row gw-changes-dir" style={{ paddingLeft: `${row.depth * INDENT_PX + ROW_PADDING_PX}px` }} role="treeitem" aria-expanded={!row.isCollapsed} onClick={() => onToggle(row.path)}>
      <Icon name={row.isCollapsed ? 'chevron-right' : 'chevron-down'} />
      <Icon name="folder" />
      <span class="gw-changes-name">{row.name}/</span>
      <ThreadCount count={threadCount} />
      <span class="gw-changes-spacer" />
      <span class="gw-changes-comment-slot">
        <CommentIcon scope={REVIEW_SCOPE} target={joinRepoPath(repo, row.path)} isCountShown={false} />
      </span>
      <span class="gw-changes-letter" aria-hidden="true" />
    </div>
  );
}

interface FileRowProps {
  readonly row: Extract<TreeRow, { type: 'file' }>;
  readonly repo: string | undefined;
  readonly threadCount: number;
  readonly isListView: boolean;
  readonly onOpenDiff: (file: DiffFile) => void;
  readonly onOpenFile: (file: DiffFile) => void;
}

function FileRowView({ row, repo, threadCount, isListView, onOpenDiff, onOpenFile }: FileRowProps): JSX.Element {
  const t = useT();
  const { file } = row;
  const kind = changeKindOf(file);
  const target = joinRepoPath(repo, file.path);
  return (
    <div
      class="gw-changes-row gw-changes-file"
      style={{ paddingLeft: `${row.depth * INDENT_PX + ROW_PADDING_PX}px` }}
      role="treeitem"
      tabIndex={0}
      title={t('vsc.changes.openDiff')}
      onClick={() => onOpenDiff(file)}
      onKeyDown={(event) => event.key === 'Enter' && onOpenDiff(file)}
    >
      <Icon name="file" />
      <FileName file={file} isListView={isListView} kindClass={`gw-changes-kind-${kind}`} />
      <ThreadCount count={threadCount} />
      <span class="gw-changes-spacer" />
      <span class="gw-changes-stat">
        <span class="gw-changes-add" title={t('vsc.changes.additions', { count: file.additions })}>{`+${file.additions}`}</span>
        <span class="gw-changes-del" title={t('vsc.changes.deletions', { count: file.deletions })}>{`-${file.deletions}`}</span>
      </span>
      <span class="gw-changes-action">
        {kind !== 'deleted' && <IconButton icon="go-to-file" title={t('vsc.changes.openFile')} onClick={(event) => openFileOnly(event, file, onOpenFile)} />}
      </span>
      <span class="gw-changes-comment-slot">
        <CommentIcon scope={REVIEW_SCOPE} target={target} isCountShown={false} />
      </span>
      <span class={`gw-changes-letter gw-changes-kind-${kind}`} title={t(`vsc.changes.kind.${kind}`)}>{CHANGE_LETTERS[kind]}</span>
    </div>
  );
}

function openFileOnly(event: MouseEvent, file: DiffFile, onOpenFile: (file: DiffFile) => void): void {
  event.stopPropagation();
  onOpenFile(file);
}

function FileName({ file, isListView, kindClass }: { readonly file: DiffFile; readonly isListView: boolean; readonly kindClass: string }): JSX.Element {
  const isRenamed = Boolean(file.old_path) && file.old_path !== file.path;
  return (
    <>
      <span class={`gw-changes-name ${kindClass}`} title={file.path}>{isListView ? file.path : fileLabel(file)}</span>
      {isListView && isRenamed && <span class="gw-muted gw-changes-moved">{`← ${file.old_path}`}</span>}
    </>
  );
}
