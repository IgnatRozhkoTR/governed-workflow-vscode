import type { WorkspaceRef } from '../api/types';

export const REMOTE_FILE_SCHEME = 'gw-file';
export const BASE_FILE_SCHEME = 'gw-base';

export interface UriParts {
  readonly scheme: string;
  readonly authority: string;
  readonly path: string;
  readonly query: string;
}

export interface RemoteFileLocation {
  readonly workspace: WorkspaceRef;
  readonly relPath: string;
}

export interface BaseFileLocation extends RemoteFileLocation {
  readonly baseRef: string;
  readonly repo?: string;
}

export class InvalidWorkflowUriError extends Error {
  constructor(readonly uri: UriParts, reason: string) {
    super(`Invalid ${uri.scheme} URI "${uri.scheme}://${uri.authority}${uri.path}": ${reason}`);
    this.name = 'InvalidWorkflowUriError';
  }
}

export function remoteFileUriParts(location: RemoteFileLocation): UriParts {
  return { scheme: REMOTE_FILE_SCHEME, ...locationParts(location), query: '' };
}

export function baseFileUriParts(location: BaseFileLocation): UriParts {
  const query = new URLSearchParams({ ref: location.baseRef });
  if (location.repo !== undefined) {
    query.set('repo', location.repo);
  }
  return { scheme: BASE_FILE_SCHEME, ...locationParts(location), query: query.toString() };
}

export function parseRemoteFileUri(uri: UriParts): RemoteFileLocation {
  requireScheme(uri, REMOTE_FILE_SCHEME);
  return parseLocation(uri);
}

export function parseBaseFileUri(uri: UriParts): BaseFileLocation {
  requireScheme(uri, BASE_FILE_SCHEME);
  const query = new URLSearchParams(uri.query);
  const baseRef = query.get('ref');
  if (!baseRef) {
    throw new InvalidWorkflowUriError(uri, 'missing ref query parameter');
  }
  return { ...parseLocation(uri), baseRef, repo: query.get('repo') ?? undefined };
}

function locationParts(location: RemoteFileLocation): Pick<UriParts, 'authority' | 'path'> {
  const relPath = trimSlashes(location.relPath);
  const branchSegment = encodeURIComponent(location.workspace.branch);
  return {
    authority: location.workspace.projectId,
    path: relPath ? `/${branchSegment}/${relPath}` : `/${branchSegment}`,
  };
}

function parseLocation(uri: UriParts): RemoteFileLocation {
  const [branchSegment, ...rest] = trimSlashes(uri.path).split('/');
  if (!uri.authority || !branchSegment) {
    throw new InvalidWorkflowUriError(uri, 'expected <project>/<branch>/<path>');
  }
  const workspace = { projectId: uri.authority, branch: decodeBranchSegment(uri, branchSegment) };
  return { workspace, relPath: rest.join('/') };
}

function decodeBranchSegment(uri: UriParts, segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    throw new InvalidWorkflowUriError(uri, `branch segment "${segment}" is not valid percent-encoding`);
  }
}

function requireScheme(uri: UriParts, scheme: string): void {
  if (uri.scheme !== scheme) {
    throw new InvalidWorkflowUriError(uri, `expected scheme ${scheme}`);
  }
}

function trimSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '');
}
