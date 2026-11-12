import type { DiffFile } from '../api/types';
import { joinRepoPath } from '../shared/paths';
import type { ChangeKind, DiffSource } from '../shared/protocol';
import { changeKindOf } from './diffView';

export type WorkingTreeMode = 'branch' | 'uncommitted';
export type ChangesLayout = 'tree' | 'list';

const ROOT_REPO_KEY = '.';
const PATH_SEPARATOR = '/';

export interface RepoChanges {
  readonly repo: string | undefined;
  readonly name: string;
  readonly source: DiffSource;
  readonly files: readonly DiffFile[];
}

export interface ChangeFileNode {
  readonly type: 'file';
  readonly id: string;
  readonly source: DiffSource;
  readonly file: DiffFile;
  readonly kind: ChangeKind;
  readonly workspacePath: string;
  readonly directory?: string;
}

export interface ChangeFolderNode {
  readonly type: 'folder';
  readonly id: string;
  readonly label: string;
  readonly workspacePath: string;
  readonly children: readonly ChangeNode[];
}

export interface ChangeRepoNode {
  readonly type: 'repo';
  readonly id: string;
  readonly repo: RepoChanges;
  readonly children: readonly ChangeNode[];
}

export type ChangeNode = ChangeFileNode | ChangeFolderNode | ChangeRepoNode;

interface FolderBuilder {
  readonly folders: Map<string, FolderBuilder>;
  readonly files: DiffFile[];
}

export function buildChangeNodes(repos: readonly RepoChanges[], layout: ChangesLayout): ChangeNode[] {
  const changed = repos.filter((entry) => entry.files.length > 0);
  if (repos.length <= 1) {
    return changed.flatMap((entry) => repoChildren(entry, layout));
  }
  return changed.map((entry) => ({ type: 'repo', id: `repo:${repoKey(entry)}`, repo: entry, children: repoChildren(entry, layout) }));
}

export function countChangedFiles(repos: readonly RepoChanges[]): number {
  return repos.reduce((total, entry) => total + entry.files.length, 0);
}

function repoChildren(entry: RepoChanges, layout: ChangesLayout): ChangeNode[] {
  return layout === 'list' ? listNodes(entry) : folderChildren(entry, folderTreeOf(entry.files), '');
}

function listNodes(entry: RepoChanges): ChangeFileNode[] {
  return sortByPath(entry.files).map((file) => fileNode(entry, file, directoryOf(file.path)));
}

function folderTreeOf(files: readonly DiffFile[]): FolderBuilder {
  const root = emptyFolder();
  for (const file of files) {
    const folderNames = file.path.split(PATH_SEPARATOR).slice(0, -1);
    const parent = folderNames.reduce((folder, name) => childFolder(folder, name), root);
    parent.files.push(file);
  }
  return root;
}

function childFolder(parent: FolderBuilder, name: string): FolderBuilder {
  const existing = parent.folders.get(name);
  if (existing !== undefined) {
    return existing;
  }
  const created = emptyFolder();
  parent.folders.set(name, created);
  return created;
}

function folderChildren(entry: RepoChanges, folder: FolderBuilder, parentPath: string): ChangeNode[] {
  const subfolders = [...folder.folders.entries()].sort(([left], [right]) => comparePaths(left, right));
  const folders = subfolders.map(([name, subfolder]) => folderNode(entry, name, subfolder, parentPath));
  const files = sortByPath(folder.files).map((file) => fileNode(entry, file, undefined));
  return [...folders, ...files];
}

// Like the Source Control view, a folder whose only content is one subfolder merges into it ("src/main/java").
function folderNode(entry: RepoChanges, name: string, folder: FolderBuilder, parentPath: string): ChangeFolderNode {
  let label = name;
  let current = folder;
  while (current.files.length === 0 && current.folders.size === 1) {
    const [childName, child] = [...current.folders.entries()][0];
    label = `${label}${PATH_SEPARATOR}${childName}`;
    current = child;
  }
  const path = parentPath === '' ? label : `${parentPath}${PATH_SEPARATOR}${label}`;
  return {
    type: 'folder',
    id: `folder:${repoKey(entry)}:${path}`,
    label,
    workspacePath: joinRepoPath(entry.repo, path),
    children: folderChildren(entry, current, path),
  };
}

function fileNode(entry: RepoChanges, file: DiffFile, directory: string | undefined): ChangeFileNode {
  return {
    type: 'file',
    id: `file:${repoKey(entry)}:${file.path}`,
    source: entry.source,
    file,
    kind: changeKindOf(file),
    workspacePath: joinRepoPath(entry.repo, file.path),
    directory,
  };
}

function directoryOf(path: string): string | undefined {
  const separator = path.lastIndexOf(PATH_SEPARATOR);
  return separator <= 0 ? undefined : path.slice(0, separator);
}

function repoKey(entry: RepoChanges): string {
  return entry.repo ?? ROOT_REPO_KEY;
}

function sortByPath(files: readonly DiffFile[]): DiffFile[] {
  return [...files].sort((left, right) => comparePaths(left.path, right.path));
}

function comparePaths(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true });
}

function emptyFolder(): FolderBuilder {
  return { folders: new Map(), files: [] };
}
