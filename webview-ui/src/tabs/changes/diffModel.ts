import type { DiffFile } from '@api-types';
import type { ChangeKind, DiffFileRef } from '@shared/protocol';

const ADDED_STATUS = 'new';
const DELETED_STATUS = 'deleted';
const ADDED_MARKER = /^--- \/dev\/null$/m;
const DELETED_MARKER = /^\+\+\+ \/dev\/null$/m;
const ROOT_REPO = '.';

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
    const row: DirRow = { type: 'dir', name: node.name, path: node.path, depth, isCollapsed };
    return isCollapsed ? [row] : [row, ...flattenTree(node.children, collapsed, depth + 1)];
  });
}

export function resolveRepo(repoPaths: readonly string[], saved: string): string {
  return repoPaths.includes(saved) ? saved : (repoPaths[0] ?? '');
}

export function diffErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
}
