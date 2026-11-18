import { InvalidWorkflowUriError, type UriParts } from './uris';

export const GIT_SCHEME = 'git';

// A document of VS Code's built-in Git extension (Source Control graph, timeline, Open Changes, commit
// multi-diff): the file at fsPath read at ref, which is a commit, a parent ("<sha>^"), "HEAD", or "~" for the index.
export interface GitDocumentLocation {
  readonly fsPath: string;
  readonly ref: string;
}

interface GitUriQuery {
  readonly path?: unknown;
  readonly ref?: unknown;
  readonly submoduleOf?: unknown;
}

// Submodule entries open as a generated "<path>.diff" text, not a file of the workspace, so they have no location.
export function parseGitUri(uri: UriParts): GitDocumentLocation | undefined {
  if (uri.scheme !== GIT_SCHEME) {
    throw new InvalidWorkflowUriError(uri, `expected scheme ${GIT_SCHEME}`);
  }
  const query = parseQuery(uri);
  if (query.submoduleOf !== undefined) {
    return undefined;
  }
  if (typeof query.path !== 'string' || query.path === '' || typeof query.ref !== 'string') {
    throw new InvalidWorkflowUriError(uri, 'expected a JSON query with string path and ref');
  }
  return { fsPath: query.path, ref: query.ref };
}

function parseQuery(uri: UriParts): GitUriQuery {
  let parsed: unknown;
  try {
    parsed = JSON.parse(uri.query);
  } catch {
    throw new InvalidWorkflowUriError(uri, 'query is not JSON');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new InvalidWorkflowUriError(uri, 'query is not a JSON object');
  }
  return parsed as GitUriQuery;
}
