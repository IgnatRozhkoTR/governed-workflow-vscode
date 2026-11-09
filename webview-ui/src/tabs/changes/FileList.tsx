import type { DiffFile } from '@api-types';
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { CommentIcon, EmptyState, Icon, IconButton } from '../../components';
import { useT } from '../../i18n/i18n';
import { openCount } from '../../lib/comments';
import { useWorkspaceState } from '../../store/hooks';
import { buildFileTree, changeKindOf, fileLabel, flattenTree, type TreeRow } from './diffModel';

export type FileView = 'tree' | 'list';

export interface FileListProps {
  readonly files: readonly DiffFile[];
  readonly view: FileView;
  readonly hasFilter: boolean;
  readonly onOpenDiff: (file: DiffFile) => void;
  readonly onOpenFile: (file: DiffFile) => void;
}

const KIND_ICONS = {
  added: 'diff-added',
  deleted: 'diff-removed',
  renamed: 'diff-renamed',
  modified: 'diff-modified',
} as const;

const KIND_TONES = {
  added: 'gw-tone-success',
  deleted: 'gw-tone-danger',
  renamed: 'gw-tone-info',
  modified: 'gw-tone-warning',
} as const;

const INDENT_PX = 14;

export function FileList({ files, view, hasFilter, onOpenDiff, onOpenFile }: FileListProps): JSX.Element {
  const t = useT();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const rows = useMemo<readonly TreeRow[]>(() => {
    if (view === 'list') {
      return files.map((file) => ({ type: 'file', name: fileLabel(file), file, depth: 0 }));
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
          <DirRow key={`dir:${row.path}`} row={row} onToggle={toggleDir} />
        ) : (
          <FileRowView key={`file:${row.file.path}`} row={row} showFullPath={view === 'list'} onOpenDiff={onOpenDiff} onOpenFile={onOpenFile} />
        ),
      )}
    </div>
  );
}

function DirRow({ row, onToggle }: { readonly row: Extract<TreeRow, { type: 'dir' }>; readonly onToggle: (path: string) => void }): JSX.Element {
  return (
    <div class="gw-changes-row gw-changes-dir" style={{ paddingLeft: `${row.depth * INDENT_PX + 6}px` }} role="treeitem" aria-expanded={!row.isCollapsed} onClick={() => onToggle(row.path)}>
      <Icon name={row.isCollapsed ? 'chevron-right' : 'chevron-down'} />
      <Icon name="folder" />
      <span class="gw-changes-name">{row.name}/</span>
      <CommentIcon scope="review" target={row.path} />
    </div>
  );
}

interface FileRowProps {
  readonly row: Extract<TreeRow, { type: 'file' }>;
  readonly showFullPath: boolean;
  readonly onOpenDiff: (file: DiffFile) => void;
  readonly onOpenFile: (file: DiffFile) => void;
}

function FileRowView({ row, showFullPath, onOpenDiff, onOpenFile }: FileRowProps): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const { file } = row;
  const kind = changeKindOf(file);
  const hasOpenComments = openCount(state, 'review', file.path) > 0;
  const label = showFullPath ? file.path : row.name;
  return (
    <div
      class="gw-changes-row gw-changes-file"
      style={{ paddingLeft: `${row.depth * INDENT_PX + 6}px` }}
      role="treeitem"
      tabIndex={0}
      title={t('vsc.changes.openDiff')}
      onClick={() => onOpenDiff(file)}
      onKeyDown={(event) => event.key === 'Enter' && onOpenDiff(file)}
    >
      <Icon name={KIND_ICONS[kind]} className={KIND_TONES[kind]} />
      <span class="gw-changes-name" title={file.path}>{label}</span>
      {file.old_path && file.old_path !== file.path && showFullPath && <span class="gw-muted gw-changes-moved">{`← ${file.old_path}`}</span>}
      {hasOpenComments && <span class="gw-changes-dot" title={t('vsc.changes.unresolved')} />}
      <span class="gw-changes-spacer" />
      <CommentIcon scope="review" target={file.path} />
      <span class="gw-changes-action">
        <IconButton icon="go-to-file" title={t('vsc.changes.openFile')} onClick={() => onOpenFile(file)} />
      </span>
      <span class="gw-changes-stat">
        <span class="gw-changes-add" title={t('vsc.changes.additions', { count: file.additions })}>{`+${file.additions}`}</span>
        <span class="gw-changes-del" title={t('vsc.changes.deletions', { count: file.deletions })}>{`-${file.deletions}`}</span>
      </span>
    </div>
  );
}
