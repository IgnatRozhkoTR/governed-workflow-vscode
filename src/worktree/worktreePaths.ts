import * as path from 'node:path';
import type { WorkspaceRef } from '../api/types';

const CASE_INSENSITIVE_PLATFORMS: readonly NodeJS.Platform[] = ['darwin', 'win32'];
const ARCHIVED_STATUS = 'archived';

export interface WorkspaceLocation {
  readonly ref: WorkspaceRef;
  readonly workingDir: string;
  readonly status: string;
}

export interface ProjectLocation {
  readonly id: string;
  readonly path: string;
}

export function isCaseInsensitivePlatform(platform: NodeJS.Platform = process.platform): boolean {
  return CASE_INSENSITIVE_PLATFORMS.includes(platform);
}

export function normalizeFsPath(fsPath: string, isCaseInsensitive = isCaseInsensitivePlatform()): string {
  const resolved = path.resolve(fsPath);
  return isCaseInsensitive ? resolved.toLowerCase() : resolved;
}

export function isSameOrInside(childPath: string, parentPath: string, isCaseInsensitive = isCaseInsensitivePlatform()): boolean {
  const relative = path.relative(normalizeFsPath(parentPath, isCaseInsensitive), normalizeFsPath(childPath, isCaseInsensitive));
  return relative === '' || (!isParentTraversal(relative) && !path.isAbsolute(relative));
}

export function isWindowOnWorktree(windowFolders: readonly string[], workingDir: string, isCaseInsensitive = isCaseInsensitivePlatform()): boolean {
  return workingDir !== '' && windowFolders.some((folder) => isSameOrInside(folder, workingDir, isCaseInsensitive));
}

export function projectsContainingFolders(
  projects: readonly ProjectLocation[],
  windowFolders: readonly string[],
  isCaseInsensitive = isCaseInsensitivePlatform(),
): ProjectLocation[] {
  return projects
    .filter((project) => project.path !== '' && windowFolders.some((folder) => isSameOrInside(folder, project.path, isCaseInsensitive)))
    .sort((left, right) => right.path.length - left.path.length);
}

export function findWorkspaceForFolders(
  workspaces: readonly WorkspaceLocation[],
  windowFolders: readonly string[],
  isCaseInsensitive = isCaseInsensitivePlatform(),
): WorkspaceRef | undefined {
  const active = workspaces.filter((workspace) => workspace.status !== ARCHIVED_STATUS && workspace.workingDir !== '');
  for (const folder of windowFolders) {
    const match = uniqueDeepestContaining(active, folder, isCaseInsensitive);
    if (match !== undefined) {
      return match.ref;
    }
  }
  return undefined;
}

// Several non-worktree workspaces share the project root as working_dir; guessing between them would select the wrong one.
function uniqueDeepestContaining(
  workspaces: readonly WorkspaceLocation[],
  folder: string,
  isCaseInsensitive: boolean,
): WorkspaceLocation | undefined {
  const containing = workspaces.filter((workspace) => isSameOrInside(folder, workspace.workingDir, isCaseInsensitive));
  const deepestLength = Math.max(...containing.map((workspace) => normalizeFsPath(workspace.workingDir, isCaseInsensitive).length));
  const deepest = containing.filter((workspace) => normalizeFsPath(workspace.workingDir, isCaseInsensitive).length === deepestLength);
  return deepest.length === 1 ? deepest[0] : undefined;
}

function isParentTraversal(relative: string): boolean {
  return relative === '..' || relative.startsWith(`..${path.sep}`);
}
