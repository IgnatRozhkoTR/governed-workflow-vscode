import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, encodeBranchPath, wsPath } from '../src/api/client';
import { ApiError, AuthRequiredError } from '../src/api/errors';

const SERVER = 'http://localhost:5111';
const WORKSPACE = { projectId: 'my proj', branch: 'feature/login flow' };
const WS_BASE = `${SERVER}/api/ws/my%20proj/feature/login%20flow`;

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

function client(...args: [] | [string | undefined]): ApiClient {
  const token = args.length === 0 ? 'secret' : args[0];
  return new ApiClient(() => SERVER, async () => token);
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('path helpers', () => {
  it('should keep slashes and encode other characters when encoding a branch path', () => {
    expect(encodeBranchPath('feature/a b#1')).toBe('feature/a%20b%231');
  });

  it('should build the workspace path with an encoded project and branch when calling wsPath', () => {
    expect(wsPath(WORKSPACE, 'state')).toBe('/api/ws/my%20proj/feature/login%20flow/state');
  });
});

describe('ApiClient requests', () => {
  it('should send the bearer token when a token is stored', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ projects: [] }));

    await client('abc').listProjects();

    expect(lastCall().init.headers).toMatchObject({ Authorization: 'Bearer abc', Accept: 'application/json' });
  });

  it('should omit the Authorization header when no token is stored', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ projects: [] }));

    await client(undefined).listProjects();

    expect(lastCall().init.headers).not.toHaveProperty('Authorization');
  });

  it('should return the projects array when the server responds with a projects envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ projects: [{ id: 'p' }] }));

    const result = await client().listProjects();

    expect(result).toEqual([{ id: 'p' }]);
    expect(lastCall().url).toBe(`${SERVER}/api/projects`);
  });

  it('should call the encoded workspace URL when the branch contains a slash', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ criteria: [] }));

    await client().getCriteria(WORKSPACE);

    expect(lastCall().url).toBe(`${WS_BASE}/criteria`);
  });

  it('should send a JSON body with a content type when posting a comment', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 9 }));

    const id = await client().addComment(WORKSPACE, { scope: 'review', text: 'hi' });

    expect(id).toBe(9);
    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(lastCall().init.body).toBe(JSON.stringify({ scope: 'review', text: 'hi' }));
  });

  it('should skip undefined query values when listing comments with a partial query', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ comments: [] }));

    await client().listComments(WORKSPACE, { scope: 'review', resolved: false });

    expect(new URL(lastCall().url).searchParams.toString()).toBe('scope=review&resolved=false');
  });

  it('should send an empty body when approving with a blank commit message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ phase: 'a', previous_phase: 'b', status: 'ok' }));

    await client().approve(WORKSPACE, '   ');

    expect(lastCall().init.body).toBe('{}');
  });

  it('should send the commit message when approving with one', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ phase: 'a', previous_phase: 'b', status: 'ok' }));

    await client().approve(WORKSPACE, 'feat: x');

    expect(lastCall().init.body).toBe(JSON.stringify({ commit_message: 'feat: x' }));
  });

  it('should return raw bytes and pass ref and repo when fetching file content', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([0, 255, 7])));

    const bytes = await client().getFileContent(WORKSPACE, 'a b.bin', { ref: 'main', repo: 'libs' });

    expect(Array.from(bytes)).toEqual([0, 255, 7]);
    const params = new URL(lastCall().url).searchParams;
    expect([params.get('path'), params.get('ref'), params.get('repo')]).toEqual(['a b.bin', 'main', 'libs']);
  });
});

describe('ApiClient error mapping', () => {
  it('should throw AuthRequiredError when the server responds 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'unauthorized', message: 'bad token' }, { status: 401 }));

    const failure = client().listProjects();

    await expect(failure).rejects.toBeInstanceOf(AuthRequiredError);
    await expect(failure).rejects.toMatchObject({ status: 401, message: 'bad token' });
  });

  it('should throw ApiError with status and code when the server responds 404 with an error body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'workspace_not_found', message: 'nope' }, { status: 404 }));

    const failure = client().getContext(WORKSPACE);

    await expect(failure).rejects.toMatchObject({ name: 'ApiError', status: 404, code: 'workspace_not_found', message: 'nope' });
  });

  it('should prefer details over message when the error body has both', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'bad', details: 'precise', message: 'vague' }, { status: 400 }));

    await expect(client().listProjects()).rejects.toMatchObject({ message: 'precise' });
  });

  it('should fall back to http_<status> and the body text when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('Internal oops', { status: 500 }));

    await expect(client().listProjects()).rejects.toMatchObject({ status: 500, code: 'http_500', message: 'Internal oops' });
  });

  it('should throw ApiError invalid_response when a 200 body is malformed JSON', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 200 }));

    await expect(client().listProjects()).rejects.toMatchObject({ status: 200, code: 'invalid_response' });
  });

  it('should throw ApiError network_error with status 0 when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('connection refused'));

    const failure = client().listProjects();

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 0, code: 'network_error' });
  });

  it('should throw ApiError invalid_server_url when the server URL is not parseable', async () => {
    const broken = new ApiClient(() => 'not a url', async () => 'secret');

    await expect(broken.listProjects()).rejects.toMatchObject({ code: 'invalid_server_url' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ApiClient.getState', () => {
  it('should send If-None-Match and report notModified when the server responds 304', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 304 }));

    const result = await client().getState(WORKSPACE, '"v1"');

    expect(result).toEqual({ notModified: true });
    expect(lastCall().init.headers).toMatchObject({ 'If-None-Match': '"v1"' });
  });

  it('should not send If-None-Match when no etag is given', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ phase: '1' }));

    await client().getState(WORKSPACE);

    expect(lastCall().init.headers).not.toHaveProperty('If-None-Match');
  });

  it('should return the state and the ETag header when the server responds 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ phase: '2.0' }, { headers: { ETag: '"v2"' } }));

    const result = await client().getState(WORKSPACE);

    expect(result).toEqual({ notModified: false, state: { phase: '2.0', pending_gate: null }, etag: '"v2"' });
  });

  it('should leave etag undefined when the response has no ETag header', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ phase: '2.0' }));

    const result = await client().getState(WORKSPACE);

    expect(result).toMatchObject({ notModified: false, etag: undefined });
  });
});

describe('ApiClient.checkToken', () => {
  it('should return false when the server responds 401', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 401 }));

    expect(await client().checkToken('bad')).toBe(false);
  });

  it('should return true and post the token when the server accepts it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));

    expect(await client().checkToken('good')).toBe(true);
    expect(lastCall().init.body).toBe(JSON.stringify({ token: 'good' }));
  });

  it('should throw ApiError when the server responds 500', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

    await expect(client().checkToken('x')).rejects.toMatchObject({ status: 500 });
  });
});

describe('ApiClient.terminalSocketUrl', () => {
  it('should use ws, the token query and an explicit claude suffix when the branch contains a slash', async () => {
    const url = new URL(await client('tok en').terminalSocketUrl(WORKSPACE));

    expect(url.protocol).toBe('ws:');
    expect(url.pathname).toBe('/ws/terminal/my%20proj/feature/login%20flow/claude');
    expect(url.searchParams.get('token')).toBe('tok en');
  });

  it('should use the claude suffix when the branch has no slash', async () => {
    const url = new URL(await client().terminalSocketUrl({ projectId: 'p', branch: 'main' }));

    expect(url.pathname).toBe('/ws/terminal/p/main/claude');
  });

  it('should use wss when the server URL is https', async () => {
    const secure = new ApiClient(() => 'https://panel.example.com', async () => 'secret');

    const url = new URL(await secure.terminalSocketUrl({ projectId: 'p', branch: 'main' }));

    expect(url.protocol).toBe('wss:');
  });

  it('should throw AuthRequiredError when no token is stored', async () => {
    await expect(client(undefined).terminalSocketUrl(WORKSPACE)).rejects.toBeInstanceOf(AuthRequiredError);
  });
});
