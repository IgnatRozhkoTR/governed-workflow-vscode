import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../src/api/client';

const SERVER = 'http://localhost:5111';
const WORKSPACE = { projectId: 'proj', branch: 'feature/x' };
const WS_BASE = `${SERVER}/api/ws/proj/feature/x`;

let fetchMock: ReturnType<typeof vi.fn>;

function client(): ApiClient {
  return new ApiClient(() => SERVER, async () => 'secret');
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('host-only client methods', () => {
  it('terminalKill_shouldPostKindClaude_whenKindOmitted', async () => {
    await client().terminalKill(WORKSPACE);
    const { url, init } = lastCall();
    expect(url).toBe(`${WS_BASE}/terminal/kill`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ kind: 'claude' }));
  });

  it('killTerminalSession_shouldPostEncodedName_whenNameHasSpecialCharacters', async () => {
    await client().killTerminalSession('gw a/b');
    expect(lastCall().url).toBe(`${SERVER}/api/terminal/sessions/gw%20a%2Fb/kill`);
  });

  it('listTerminalSessions_shouldReturnSessionArray', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([{ name: 'a', attached: false }]), { status: 200 }));
    expect(await client().listTerminalSessions()).toEqual([{ name: 'a', attached: false }]);
  });

  it('writeFile_shouldPutPathAndContent', async () => {
    await client().writeFile(WORKSPACE, 'src/a.ts', 'hello');
    const { url, init } = lastCall();
    expect(url).toBe(`${WS_BASE}/file`);
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ path: 'src/a.ts', content: 'hello' }));
  });

  it('uploadPasteImage_shouldSendMultipartWithoutJsonContentType', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, mode: 'path', path: '/x.png' }), { status: 200 }));
    const result = await client().uploadPasteImage(WORKSPACE, new Uint8Array([1, 2]), 'image/png', 'x.png');
    const { url, init } = lastCall();
    expect(url).toBe(`${WS_BASE}/terminal/paste-image`);
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('image')).toBeInstanceOf(Blob);
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(result.path).toBe('/x.png');
  });

  it('deleteProject_shouldSendDelete', async () => {
    await client().deleteProject('p 1');
    const { url, init } = lastCall();
    expect(url).toBe(`${SERVER}/api/projects/p%201`);
    expect(init.method).toBe('DELETE');
  });

  it('archiveWorkspace_shouldPutArchive', async () => {
    await client().archiveWorkspace(WORKSPACE);
    const { url, init } = lastCall();
    expect(url).toBe(`${WS_BASE}/archive`);
    expect(init.method).toBe('PUT');
  });

  it('setupStart_shouldPostSelection', async () => {
    const request = { modules: ['m'], languages: [1], custom_languages: [] };
    await client().setupStart(request);
    const { url, init } = lastCall();
    expect(url).toBe(`${SERVER}/api/setup/start`);
    expect(init.body).toBe(JSON.stringify(request));
  });

  it('terminalSessionSocketUrl_shouldUseWsSchemeAndToken', async () => {
    expect(await client().terminalSessionSocketUrl('gw x')).toBe('ws://localhost:5111/ws/terminal-session/gw%20x?token=secret');
    expect(await client().setupSocketUrl()).toBe('ws://localhost:5111/ws/setup-terminal?token=secret');
  });
});
