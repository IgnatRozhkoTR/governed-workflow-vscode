import { describe, expect, it } from 'vitest';
import {
  findWorkspaceForFolders,
  isCaseInsensitivePlatform,
  isSameOrInside,
  isWindowOnWorktree,
  projectsContainingFolders,
  type WorkspaceLocation,
} from '../src/worktree/worktreePaths';

const PROJECT = '/home/dev/shop';
const WORKTREE = `${PROJECT}/.claude/worktrees/feature-a`;
const MULTI_WORKTREE = '/home/dev/suite/.claude/worktrees/feature-m';

function location(branch: string, workingDir: string, status = 'active'): WorkspaceLocation {
  return { ref: { projectId: 'shop', branch }, workingDir, status };
}

describe('isSameOrInside', () => {
  it('isSameOrInside_shouldBeTrue_whenPathsAreEqualAfterNormalisation', () => {
    expect(isSameOrInside(`${WORKTREE}/`, WORKTREE, false)).toBe(true);
    expect(isSameOrInside(`${WORKTREE}/src/..`, WORKTREE, false)).toBe(true);
  });

  it('isSameOrInside_shouldBeTrue_whenChildIsNested', () => {
    expect(isSameOrInside(`${WORKTREE}/src/main`, WORKTREE, false)).toBe(true);
  });

  it('isSameOrInside_shouldBeFalse_whenChildIsSiblingWithSharedPrefix', () => {
    expect(isSameOrInside(`${WORKTREE}-2`, WORKTREE, false)).toBe(false);
  });

  it('isSameOrInside_shouldBeFalse_whenChildIsTheParentOfTheWorktree', () => {
    expect(isSameOrInside(PROJECT, WORKTREE, false)).toBe(false);
  });

  it('isSameOrInside_shouldBeTrue_whenInsideADirectoryNamedWithLeadingDots', () => {
    expect(isSameOrInside(`${WORKTREE}/..cache`, WORKTREE, false)).toBe(true);
  });

  it('isSameOrInside_shouldFoldCase_onlyWhenCaseInsensitive', () => {
    expect(isSameOrInside('/Home/Dev/Shop', PROJECT, true)).toBe(true);
    expect(isSameOrInside('/Home/Dev/Shop', PROJECT, false)).toBe(false);
  });
});

describe('isCaseInsensitivePlatform', () => {
  it('isCaseInsensitivePlatform_shouldFollowPlatformFilesystemDefaults', () => {
    expect(isCaseInsensitivePlatform('darwin')).toBe(true);
    expect(isCaseInsensitivePlatform('win32')).toBe(true);
    expect(isCaseInsensitivePlatform('linux')).toBe(false);
  });
});

describe('isWindowOnWorktree', () => {
  it('isWindowOnWorktree_shouldBeTrue_whenAnyWindowFolderIsTheWorktree', () => {
    expect(isWindowOnWorktree(['/tmp/other', WORKTREE], WORKTREE, false)).toBe(true);
  });

  it('isWindowOnWorktree_shouldBeTrue_whenWindowIsOnOneRepoOfAMultiRepoWorktree', () => {
    expect(isWindowOnWorktree([`${MULTI_WORKTREE}/backend`, `${MULTI_WORKTREE}/frontend`], MULTI_WORKTREE, false)).toBe(true);
  });

  it('isWindowOnWorktree_shouldBeFalse_whenWindowIsOnTheProjectRootAboveTheWorktree', () => {
    expect(isWindowOnWorktree([PROJECT], WORKTREE, false)).toBe(false);
  });

  it('isWindowOnWorktree_shouldBeFalse_whenWindowHasNoFoldersOrWorkingDirIsEmpty', () => {
    expect(isWindowOnWorktree([], WORKTREE, false)).toBe(false);
    expect(isWindowOnWorktree([PROJECT], '', false)).toBe(false);
  });
});

describe('projectsContainingFolders', () => {
  it('projectsContainingFolders_shouldReturnContainingProjects_deepestFirst', () => {
    const projects = [
      { id: 'home', path: '/home/dev' },
      { id: 'shop', path: PROJECT },
      { id: 'other', path: '/srv/other' },
      { id: 'empty', path: '' },
    ];

    const result = projectsContainingFolders(projects, [WORKTREE], false);

    expect(result.map((project) => project.id)).toEqual(['shop', 'home']);
  });

  it('projectsContainingFolders_shouldReturnNothing_whenWindowIsOutsideEveryProject', () => {
    expect(projectsContainingFolders([{ id: 'shop', path: PROJECT }], ['/tmp/scratch'], false)).toEqual([]);
  });
});

describe('findWorkspaceForFolders', () => {
  it('findWorkspaceForFolders_shouldPickWorktree_overProjectRootWorkspace', () => {
    const workspaces = [location('main', PROJECT), location('feature/a', WORKTREE)];

    expect(findWorkspaceForFolders(workspaces, [`${WORKTREE}/src`], false)).toEqual({ projectId: 'shop', branch: 'feature/a' });
  });

  it('findWorkspaceForFolders_shouldMatchMultiRepoWorktree_whenWindowIsOnOneRepo', () => {
    const workspaces = [location('feature/m', MULTI_WORKTREE)];

    expect(findWorkspaceForFolders(workspaces, [`${MULTI_WORKTREE}/backend`], false)?.branch).toBe('feature/m');
  });

  it('findWorkspaceForFolders_shouldSkipArchivedWorkspaces', () => {
    const workspaces = [location('feature/a', WORKTREE, 'archived')];

    expect(findWorkspaceForFolders(workspaces, [WORKTREE], false)).toBeUndefined();
  });

  it('findWorkspaceForFolders_shouldReturnNothing_whenTwoWorkspacesShareTheMatchingDir', () => {
    const workspaces = [location('task/1', PROJECT), location('task/2', PROJECT)];

    expect(findWorkspaceForFolders(workspaces, [PROJECT], false)).toBeUndefined();
  });

  it('findWorkspaceForFolders_shouldUseALaterFolder_whenTheFirstMatchesNothing', () => {
    const workspaces = [location('feature/a', WORKTREE)];

    expect(findWorkspaceForFolders(workspaces, ['/tmp/scratch', WORKTREE], false)?.branch).toBe('feature/a');
  });

  it('findWorkspaceForFolders_shouldReturnNothing_whenNoFolders', () => {
    expect(findWorkspaceForFolders([location('feature/a', WORKTREE)], [], false)).toBeUndefined();
  });
});
