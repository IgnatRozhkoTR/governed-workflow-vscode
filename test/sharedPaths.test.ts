import { describe, expect, it } from 'vitest';
import { joinRepoPath, splitRepoPath } from '../src/shared/paths';

describe('joinRepoPath', () => {
  it('joinRepoPath_shouldReturnRelPath_whenRepoIsUndefined', () => {
    expect(joinRepoPath(undefined, 'app/x.py')).toBe('app/x.py');
  });

  it('joinRepoPath_shouldReturnRelPath_whenRepoIsEmptyOrRoot', () => {
    expect(joinRepoPath('', 'app/x.py')).toBe('app/x.py');
    expect(joinRepoPath('.', 'app/x.py')).toBe('app/x.py');
  });

  it('joinRepoPath_shouldPrefixRepo_whenRepoIsGiven', () => {
    expect(joinRepoPath('qa-api', 'app/x.py')).toBe('qa-api/app/x.py');
  });

  it('joinRepoPath_shouldNotDuplicateSlashes_whenRepoEndsOrPathStartsWithSlash', () => {
    expect(joinRepoPath('qa-api/', '/app/x.py')).toBe('qa-api/app/x.py');
  });
});

describe('splitRepoPath', () => {
  it('splitRepoPath_shouldSeparateFirstSegmentAsRepo_whenPathIsNested', () => {
    expect(splitRepoPath('qa-api/app/x.py')).toEqual({ repo: 'qa-api', relPath: 'app/x.py' });
  });

  it('splitRepoPath_shouldReturnPathOnly_whenPathHasNoDirectory', () => {
    expect(splitRepoPath('README.md')).toEqual({ relPath: 'README.md' });
  });

  it('splitRepoPath_shouldInvertJoinRepoPath', () => {
    const { repo, relPath } = splitRepoPath(joinRepoPath('qa-web', 'src/main.ts'));

    expect(joinRepoPath(repo, relPath)).toBe('qa-web/src/main.ts');
  });
});
