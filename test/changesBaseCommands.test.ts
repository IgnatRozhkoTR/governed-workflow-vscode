import { describe, expect, it } from 'vitest';
import type { RepoBranch, WorkspaceState } from '../src/api/types';
import { basePickItems, repoFilterPickItems, withTypedRef } from '../src/diff/changesBaseCommands';
import type { RepoChanges } from '../src/diff/changesModel';
import { defaultBaseFor } from '../src/shared/repoBase';

function repo(path: string, overrides: Partial<RepoChanges> = {}): RepoChanges {
  return {
    repo: path,
    path,
    name: path.toUpperCase(),
    defaultBase: 'develop',
    baseOverride: undefined,
    source: { mode: 'branch', base: 'develop', repo: path },
    files: [],
    ...overrides,
  };
}

function branch(name: string, current = false): RepoBranch {
  return { name, ref: name, current };
}

describe('defaultBaseFor', () => {
  const state = { source_branch: 'develop', repo_base_branches: { api: 'main' } } as unknown as WorkspaceState;

  it('defaultBaseFor_shouldReturnTheRepoBase_whenTheRepoConfiguresOne', () => {
    expect(defaultBaseFor(state, 'api')).toBe('main');
  });

  it('defaultBaseFor_shouldFallBackToTheWorkspaceSourceBranch_whenTheRepoHasNoOwnBase', () => {
    expect(defaultBaseFor(state, 'web')).toBe('develop');
    expect(defaultBaseFor(state, undefined)).toBe('develop');
  });

  it('defaultBaseFor_shouldFallBackToTheWorkspaceSourceBranch_whenTheServerSendsNoRepoBases', () => {
    const olderServerState = { source_branch: 'develop' } as WorkspaceState;

    expect(defaultBaseFor(olderServerState, 'api')).toBe('develop');
  });
});

describe('basePickItems', () => {
  it('basePickItems_shouldOfferTheDefaultFirstAndMarkTheCurrentBaseAndWorkspaceBranch', () => {
    const items = basePickItems(repo('api', { baseOverride: 'main' }), [branch('feature/a', true), branch('main'), branch('develop')]);

    expect(items.map((item) => [item.label, item.description, item.base])).toEqual([
      ['$(discard) Default base', 'develop', undefined],
      ['feature/a', 'workspace branch', 'feature/a'],
      ['main', 'current base', 'main'],
      ['develop', undefined, 'develop'],
    ]);
  });
});

describe('withTypedRef', () => {
  const items = basePickItems(repo('api'), [branch('main')]);

  it('withTypedRef_shouldPrependTheTypedRef_whenItIsNotAListedBranch', () => {
    const [first, ...rest] = withTypedRef(items, ' v1.2.0 ');

    expect(first).toMatchObject({ label: 'v1.2.0', base: 'v1.2.0', alwaysShow: true });
    expect(rest).toEqual(items);
  });

  it('withTypedRef_shouldKeepTheItems_whenInputIsEmptyOrAListedBranch', () => {
    expect(withTypedRef(items, '  ')).toEqual(items);
    expect(withTypedRef(items, 'main')).toEqual(items);
  });
});

describe('repoFilterPickItems', () => {
  it('repoFilterPickItems_shouldOfferAllReposAndMarkTheShownOne', () => {
    const items = repoFilterPickItems([repo('api', { files: [] }), repo('web')], 'web');

    expect(items.map((item) => [item.label, item.description, item.repoPath])).toEqual([
      ['All repositories', undefined, undefined],
      ['API', '0 changed', 'api'],
      ['WEB', 'shown', 'web'],
    ]);
  });
});
