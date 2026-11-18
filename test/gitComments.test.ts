import { describe, expect, it } from 'vitest';
import * as vscode from 'vscode';
import { annotationTargetOf } from '../src/annotations/annotationTarget';
import { commentPathOf, requireCommentPath } from '../src/comments/commentPaths';
import { GIT_SCHEME, parseGitUri } from '../src/fs/gitUris';
import { InvalidWorkflowUriError, type UriParts } from '../src/fs/uris';
import { WorkspaceLocator } from '../src/fs/workspaceLocator';
import { makeState } from './support/fixtures';

const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const WORKING_DIR = '/work/tree';
const COMMIT = '0123456789abcdef0123456789abcdef01234567';

function gitParts(fsPath: string, ref: string, extra: Record<string, string> = {}): UriParts {
  return { scheme: GIT_SCHEME, authority: '', path: fsPath, query: JSON.stringify({ path: fsPath, ref, ...extra }) };
}

function gitUri(fsPath: string, ref: string, extra: Record<string, string> = {}): vscode.Uri {
  return vscode.Uri.from(gitParts(fsPath, ref, extra));
}

function snapshotOf(projectType: 'single' | 'multi' = 'single') {
  return { workspace: WORKSPACE, state: makeState({ working_dir: WORKING_DIR, project_type: projectType }) };
}

function pathOf(uri: vscode.Uri, projectType: 'single' | 'multi' = 'single'): string | undefined {
  return commentPathOf(uri, snapshotOf(projectType), new WorkspaceLocator());
}

describe('parseGitUri', () => {
  it('parseGitUri_shouldReturnFsPathAndRef_whenCommitDocument', () => {
    expect(parseGitUri(gitParts('/work/tree/src/app.ts', COMMIT))).toEqual({ fsPath: '/work/tree/src/app.ts', ref: COMMIT });
  });

  it('parseGitUri_shouldKeepParentAndIndexRefs_asGiven', () => {
    expect(parseGitUri(gitParts('/a.ts', `${COMMIT}^`))?.ref).toBe(`${COMMIT}^`);
    expect(parseGitUri(gitParts('/a.ts', '~'))?.ref).toBe('~');
  });

  it('parseGitUri_shouldUseQueryPath_whenUriPathHasGitExtensionSuffix', () => {
    const parts = { ...gitParts('/work/tree/a.ts', 'HEAD'), path: '/work/tree/a.ts.git' };

    expect(parseGitUri(parts)?.fsPath).toBe('/work/tree/a.ts');
  });

  it('parseGitUri_shouldReturnUndefined_whenSubmoduleDiff', () => {
    expect(parseGitUri(gitParts('/work/tree/lib', COMMIT, { submoduleOf: '/work/tree' }))).toBeUndefined();
  });

  it('parseGitUri_shouldThrow_whenQueryIsNotJson', () => {
    expect(() => parseGitUri({ scheme: GIT_SCHEME, authority: '', path: '/a.ts', query: 'ref=HEAD' })).toThrow(InvalidWorkflowUriError);
  });

  it('parseGitUri_shouldThrow_whenRefIsMissing', () => {
    const parts = { scheme: GIT_SCHEME, authority: '', path: '/a.ts', query: JSON.stringify({ path: '/a.ts' }) };

    expect(() => parseGitUri(parts)).toThrow(InvalidWorkflowUriError);
  });

  it('parseGitUri_shouldThrow_whenSchemeIsNotGit', () => {
    expect(() => parseGitUri({ ...gitParts('/a.ts', 'HEAD'), scheme: 'file' })).toThrow(InvalidWorkflowUriError);
  });
});

describe('commentPathOf for built-in Git documents', () => {
  it('commentPathOf_shouldMapCommitSideToWorkingDirPath_whenFileIsInsideTheWorkspace', () => {
    expect(pathOf(gitUri(`${WORKING_DIR}/src/app.ts`, COMMIT))).toBe('src/app.ts');
  });

  it('commentPathOf_shouldMapParentSideToTheSamePath', () => {
    expect(pathOf(gitUri(`${WORKING_DIR}/src/app.ts`, `${COMMIT}^`))).toBe('src/app.ts');
  });

  it('commentPathOf_shouldKeepRepoDirectoryPrefix_whenMultiRepoWorkspace', () => {
    expect(pathOf(gitUri(`${WORKING_DIR}/api/src/app.ts`, COMMIT), 'multi')).toBe('api/src/app.ts');
  });

  it('commentPathOf_shouldReturnUndefined_whenFileIsOutsideTheWorkspace', () => {
    expect(pathOf(gitUri('/elsewhere/src/app.ts', COMMIT))).toBeUndefined();
  });

  it('commentPathOf_shouldReturnUndefined_whenSubmoduleDiff', () => {
    expect(pathOf(gitUri(`${WORKING_DIR}/lib`, COMMIT, { submoduleOf: WORKING_DIR }))).toBeUndefined();
  });

  it('requireCommentPath_shouldReject_whenGitDocumentIsOutsideTheWorkspace', () => {
    expect(() => requireCommentPath(gitUri('/elsewhere/a.ts', COMMIT), snapshotOf(), new WorkspaceLocator())).toThrow(/active workspace/);
  });
});

describe('annotationTargetOf for built-in Git documents', () => {
  it('annotationTargetOf_shouldReturnUndefined_soWorkingTreeAnnotationsStayOffHistoricContent', () => {
    const target = annotationTargetOf(gitUri(`${WORKING_DIR}/src/app.ts`, COMMIT), snapshotOf(), new WorkspaceLocator(), () => true);

    expect(target).toBeUndefined();
  });
});
