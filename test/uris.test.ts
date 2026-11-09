import { describe, expect, it } from 'vitest';
import {
  BASE_FILE_SCHEME,
  InvalidWorkflowUriError,
  REMOTE_FILE_SCHEME,
  baseFileUriParts,
  parseBaseFileUri,
  parseRemoteFileUri,
  remoteFileUriParts,
} from '../src/fs/uris';

const WORKSPACE = { projectId: 'proj-1', branch: 'feature/login-flow' };

describe('remoteFileUriParts', () => {
  it('should encode the branch slash into one path segment when the branch contains a slash', () => {
    const parts = remoteFileUriParts({ workspace: WORKSPACE, relPath: 'src/app.ts' });

    expect(parts).toEqual({
      scheme: REMOTE_FILE_SCHEME,
      authority: 'proj-1',
      path: '/feature%2Flogin-flow/src/app.ts',
      query: '',
    });
  });

  it('should produce only the branch segment when the relative path is empty', () => {
    const parts = remoteFileUriParts({ workspace: WORKSPACE, relPath: '' });

    expect(parts.path).toBe('/feature%2Flogin-flow');
  });

  it('should strip surrounding slashes when the relative path has them', () => {
    const parts = remoteFileUriParts({ workspace: WORKSPACE, relPath: '/src/app.ts/' });

    expect(parts.path).toBe('/feature%2Flogin-flow/src/app.ts');
  });
});

describe('parseRemoteFileUri', () => {
  it.each([
    ['a nested path', 'src/app.ts'],
    ['spaces', 'docs/my file.md'],
    ['unicode', 'docs/заметки/日本語.md'],
    ['the repository root', ''],
  ])('should return the original location when round-tripping %s', (_name, relPath) => {
    const location = { workspace: WORKSPACE, relPath };

    const result = parseRemoteFileUri(remoteFileUriParts(location));

    expect(result).toEqual(location);
  });

  it('should throw InvalidWorkflowUriError when the scheme is not gw-file', () => {
    const parts = { ...remoteFileUriParts({ workspace: WORKSPACE, relPath: 'a' }), scheme: BASE_FILE_SCHEME };

    expect(() => parseRemoteFileUri(parts)).toThrow(InvalidWorkflowUriError);
  });

  it('should throw InvalidWorkflowUriError when the authority is missing', () => {
    const parts = { scheme: REMOTE_FILE_SCHEME, authority: '', path: '/main/a.ts', query: '' };

    expect(() => parseRemoteFileUri(parts)).toThrow(InvalidWorkflowUriError);
  });

  it('should throw InvalidWorkflowUriError when the branch segment is empty', () => {
    const parts = { scheme: REMOTE_FILE_SCHEME, authority: 'p', path: '/', query: '' };

    expect(() => parseRemoteFileUri(parts)).toThrow(InvalidWorkflowUriError);
  });

  it('should throw InvalidWorkflowUriError when the branch has malformed percent-encoding', () => {
    const parts = { scheme: REMOTE_FILE_SCHEME, authority: 'p', path: '/bad%ZZ/a.ts', query: '' };

    expect(() => parseRemoteFileUri(parts)).toThrow(InvalidWorkflowUriError);
  });
});

describe('baseFileUriParts', () => {
  it('should put the ref in the query and omit repo when no repo is given', () => {
    const parts = baseFileUriParts({ workspace: WORKSPACE, relPath: 'a.ts', baseRef: 'main' });

    expect(parts.scheme).toBe(BASE_FILE_SCHEME);
    expect(parts.query).toBe('ref=main');
  });

  it('should include the repo in the query when a repo is given', () => {
    const parts = baseFileUriParts({ workspace: WORKSPACE, relPath: 'a.ts', baseRef: 'main', repo: 'libs/core' });

    expect(new URLSearchParams(parts.query).get('repo')).toBe('libs/core');
  });
});

describe('parseBaseFileUri', () => {
  it('should return the original location when round-tripping a ref with slashes and a repo', () => {
    const location = { workspace: WORKSPACE, relPath: 'src/a b.ts', baseRef: 'origin/release/1.0', repo: 'libs/core' };

    const result = parseBaseFileUri(baseFileUriParts(location));

    expect(result).toEqual(location);
  });

  it('should leave repo undefined when the query has no repo', () => {
    const location = { workspace: WORKSPACE, relPath: 'a.ts', baseRef: 'abc123' };

    const result = parseBaseFileUri(baseFileUriParts(location));

    expect(result.repo).toBeUndefined();
  });

  it('should throw InvalidWorkflowUriError when the ref query parameter is missing', () => {
    const parts = { ...baseFileUriParts({ workspace: WORKSPACE, relPath: 'a', baseRef: 'x' }), query: '' };

    expect(() => parseBaseFileUri(parts)).toThrow(InvalidWorkflowUriError);
  });

  it('should throw InvalidWorkflowUriError when the scheme is gw-file', () => {
    const parts = { ...baseFileUriParts({ workspace: WORKSPACE, relPath: 'a', baseRef: 'x' }), scheme: REMOTE_FILE_SCHEME };

    expect(() => parseBaseFileUri(parts)).toThrow(InvalidWorkflowUriError);
  });
});
