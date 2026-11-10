import type { DiffFile, ReviewComment } from '@api-types';
import type { ChangeKind, DiffFileRef } from '@shared/protocol';
import { joinRepoPath } from '@shared/paths';
import type { BranchEntry } from '../../api/changes';
import type { t as translate } from '../../i18n/i18n';
import { isInRepo } from '../review/reviewModel';

type Translate = typeof translate;

const ADDED_STATUS = 'new';
const DELETED_STATUS = 'deleted';
const ADDED_MARKER = /^--- \/dev\/null$/m;
const DELETED_MARKER = /^\+\+\+ \/dev\/null$/m;
const ROOT_REPO = '.';
const SINGLE_FILE = 1;

// Repo paths are directory names under the working dir, so '*' can never collide with a real repository.
export const ALL_REPOS = '*';

export type SourceMode = 'branch' | 'uncommitted' | 'commit';

const SOURCE_LABEL_KEYS: Readonly<Record<SourceMode, string>> = {
  branch: 'vsc.changes.source.branch',
  uncommitted: 'vsc.changes.source.uncommitted',
  commit: 'diff.commit',
};

export const CHANGE_LETTERS: Readonly<Record<ChangeKind, string>> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' };

export interface FileNode {
  readonly type: 'file';
  readonly name: string;
  readonly file: DiffFile;
}

export interface DirNode {
  readonly type: 'dir';
  readonly name: string;
  readonly path: string;
  readonly children: readonly TreeNode[];
}

export type TreeNode = FileNode | DirNode;

export interface DirRow {
  readonly type: 'dir';
  readonly name: string;
  readonly path: string;
  readonly depth: number;
  readonly isCollapsed: boolean;
  readonly subtreePaths: readonly string[];
}

export interface FileRow {
  readonly type: 'file';
  readonly name: string;
  readonly file: DiffFile;
  readonly depth: number;
}

export type TreeRow = DirRow | FileRow;

interface MutableDir {
  readonly dirs: Map<string, MutableDir>;
  readonly files: FileNode[];
}

export function changeKindOf(file: DiffFile): ChangeKind {
  if (file.status === ADDED_STATUS || ADDED_MARKER.test(file.diff)) {
    return 'added';
  }
  if (file.status === DELETED_STATUS || DELETED_MARKER.test(file.diff)) {
    return 'deleted';
  }
  return file.old_path ? 'renamed' : 'modified';
}

export function toDiffFileRef(file: DiffFile): DiffFileRef {
  return { path: file.path, oldPath: file.old_path, kind: changeKindOf(file) };
}

export function nativeRepo(repo: string): string | undefined {
  return repo === '' || repo === ROOT_REPO ? undefined : repo;
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function fileLabel(file: DiffFile): string {
  const name = baseName(file.path);
  return file.old_path && file.old_path !== file.path ? `${name} ← ${baseName(file.old_path)}` : name;
}

export function filesCountLabel(t: Translate, shown: number, total: number, isFiltered: boolean): string {
  if (isFiltered) {
    return t('vsc.changes.filteredCount', { shown, total });
  }
  return total === SINGLE_FILE ? t('vsc.changes.fileChangedOne') : t('badges.filesChanged', { count: total });
}

export function filterFiles(files: readonly DiffFile[], query: string): readonly DiffFile[] {
  const needle = query.trim().toLowerCase();
  return needle === '' ? files : files.filter((file) => baseName(file.path).toLowerCase().includes(needle));
}

export function buildFileTree(files: readonly DiffFile[]): readonly TreeNode[] {
  const root: MutableDir = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split('/');
    const leaf = parts[parts.length - 1] ?? file.path;
    insertFile(root, parts.slice(0, -1), { type: 'file', name: leaf, file });
  }
  return freezeDir(root, '');
}

function insertFile(root: MutableDir, dirParts: readonly string[], node: FileNode): void {
  let current = root;
  for (const part of dirParts) {
    let next = current.dirs.get(part);
    if (next === undefined) {
      next = { dirs: new Map(), files: [] };
      current.dirs.set(part, next);
    }
    current = next;
  }
  current.files.push(node);
}

function freezeDir(dir: MutableDir, parentPath: string): readonly TreeNode[] {
  const dirNodes = [...dir.dirs.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, child]) => compactDir(name, child, parentPath));
  const fileNodes = [...dir.files].sort((a, b) => a.name.localeCompare(b.name));
  return [...dirNodes, ...fileNodes];
}

function compactDir(name: string, dir: MutableDir, parentPath: string): DirNode {
  let label = name;
  let current = dir;
  let path = parentPath === '' ? name : `${parentPath}/${name}`;
  while (current.files.length === 0 && current.dirs.size === 1) {
    const [childName, child] = [...current.dirs.entries()][0] as [string, MutableDir];
    label = `${label}/${childName}`;
    path = `${path}/${childName}`;
    current = child;
  }
  return { type: 'dir', name: label, path, children: freezeDir(current, path) };
}

export function flattenTree(nodes: readonly TreeNode[], collapsed: ReadonlySet<string>, depth = 0): readonly TreeRow[] {
  return nodes.flatMap((node): readonly TreeRow[] => {
    if (node.type === 'file') {
      return [{ type: 'file', name: node.name, file: node.file, depth }];
    }
    const isCollapsed = collapsed.has(node.path);
    const row: DirRow = { type: 'dir', name: node.name, path: node.path, depth, isCollapsed, subtreePaths: subtreePaths(node) };
    return isCollapsed ? [row] : [row, ...flattenTree(node.children, collapsed, depth + 1)];
  });
}

// A folder's own path plus every folder and file below it, so a collapsed folder can roll up their thread counts.
function subtreePaths(dir: DirNode): readonly string[] {
  return [dir.path, ...dir.children.flatMap((child) => (child.type === 'file' ? [child.file.path] : subtreePaths(child)))];
}

export interface RepoRef {
  readonly path: string;
  readonly name: string;
}

export interface RepoDiff extends RepoRef {
  readonly files: readonly DiffFile[];
  readonly base?: string;
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface RepoChip {
  readonly value: string;
  readonly name: string;
  readonly fileCount?: number;
  readonly threadCount: number;
}

export interface ChangeCounts {
  readonly mode: SourceMode;
  readonly shown: number;
  readonly total: number;
  readonly uncommittedInBranch: number;
}

// Without a remembered choice a multi-repo workspace opens on every repository, so no repository's changes are missed.
export function resolveRepo(repoPaths: readonly string[], saved: string): string {
  if (repoPaths.includes(saved)) {
    return saved;
  }
  return repoPaths.length > 1 ? ALL_REPOS : (repoPaths[0] ?? '');
}

export function blockersInRepo(blockers: readonly ReviewComment[], repo: string): readonly ReviewComment[] {
  return repo === ALL_REPOS ? blockers : blockers.filter((comment) => isInRepo(comment, nativeRepo(repo)));
}

// File counts appear once every repository's diff has loaded; thread counts come from state and show at once.
export function repoChips(allLabel: string, repos: readonly RepoRef[], repoDiffs: readonly RepoDiff[] | undefined, blockers: readonly ReviewComment[]): readonly RepoChip[] {
  const fileCounts = new Map((repoDiffs ?? []).map((entry) => [entry.path, entry.files.length]));
  const totalFiles = repoDiffs === undefined ? undefined : sumFileCounts(repoDiffs);
  const perRepo = repos.map((entry) => ({
    value: entry.path,
    name: entry.name,
    fileCount: fileCounts.get(entry.path),
    threadCount: blockersInRepo(blockers, entry.path).length,
  }));
  return [{ value: ALL_REPOS, name: allLabel, fileCount: totalFiles, threadCount: blockers.length }, ...perRepo];
}

function sumFileCounts(repoDiffs: readonly RepoDiff[]): number {
  return repoDiffs.reduce((total, entry) => total + entry.files.length, 0);
}

// The branch diff runs from the base to the working tree, so it also holds every uncommitted file.
export function uncommittedInBranch(branchFiles: readonly DiffFile[], uncommittedPaths: ReadonlySet<string>, repo: string | undefined): number {
  return branchFiles.filter((file) => uncommittedPaths.has(joinRepoPath(repo, file.path))).length;
}

export function changesCountLabel(t: Translate, counts: ChangeCounts): string {
  const mode = t(SOURCE_LABEL_KEYS[counts.mode]);
  if (counts.shown !== counts.total) {
    return t('vsc.changes.count.filtered', { mode, shown: counts.shown, total: counts.total });
  }
  if (counts.mode === 'branch' && counts.uncommittedInBranch > 0) {
    return t('vsc.changes.count.split', { committed: counts.total - counts.uncommittedInBranch, uncommitted: counts.uncommittedInBranch });
  }
  return t('vsc.changes.count.mode', { mode, count: counts.total });
}

export function defaultBaseName(selectedBase: string, loadedBase: string | undefined, sourceBranch: string | null): string | undefined {
  if (selectedBase === '' && loadedBase !== undefined) {
    return loadedBase;
  }
  return sourceBranch ?? undefined;
}

// The current branch is never a meaningful base, and the default base already leads the list under its own label.
export function selectableBases(branches: readonly BranchEntry[], sourceBranch: string | null): readonly string[] {
  return branches.filter((branch) => !branch.current && branch.name !== sourceBranch).map((branch) => branch.name);
}

export function baseOptions(t: Translate, bases: readonly string[], defaultBase: string | undefined): readonly SelectOption[] {
  const defaultLabel = defaultBase === undefined ? t('diff.baseDefault') : t('vsc.changes.baseDefaultNamed', { base: defaultBase });
  return [{ value: '', label: defaultLabel }, ...bases.filter((name) => name !== defaultBase).map((name) => ({ value: name, label: name }))];
}

export function diffErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}
