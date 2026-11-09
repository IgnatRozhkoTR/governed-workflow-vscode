import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';
import { acquireShimScript } from './shimScript.mjs';
import { themeStyleTag } from './theme.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const hostBundle = join(repoRoot, '.harness-build', 'host.mjs');
const PORT = Number(process.env.GW_HARNESS_PORT ?? 5199);
const SERVER_URL = (process.env.GW_SERVER_URL ?? 'http://localhost:5111').replace(/\/+$/, '');
const TOKEN = process.env.GW_TOKEN;
const MIME = { '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.map': 'application/json', '.json': 'application/json' };
const sessions = new Map();

async function bundleHost() {
  await esbuild.build({
    entryPoints: [join(repoRoot, 'scripts/harness/hostEntry.mjs')],
    outfile: hostBundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: { vscode: join(repoRoot, 'scripts/harness/vscodeShim.mjs') },
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
    logLevel: 'warning',
  });
  return import(`${pathToFileURL(hostBundle).href}?t=${Date.now()}`);
}

function createSession(host, project, branch) {
  const id = randomUUID();
  const session = { id, queue: [], response: undefined, host: undefined };
  const push = (message) => {
    const data = `data: ${JSON.stringify(message)}\n\n`;
    session.response === undefined ? session.queue.push(data) : session.response.write(data);
  };
  session.host = host.startHarnessSession({ repoRoot, serverUrl: SERVER_URL, token: TOKEN, project, branch, onMessage: push });
  sessions.set(id, session);
  return session;
}

async function servePage(res, host, url) {
  const project = url.searchParams.get('project') ?? process.env.GW_PROJECT;
  const branch = url.searchParams.get('branch') ?? process.env.GW_BRANCH;
  if (!project || !branch) {
    res.writeHead(400).end('Set GW_PROJECT and GW_BRANCH, or pass ?project=&branch=.');
    return;
  }
  const session = createSession(host, project, branch);
  await session.host.firstState;
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(harnessHtml(session));
}

function harnessHtml(session) {
  const original = session.host.html();
  const nonce = /nonce="([^"]+)"/.exec(original)?.[1] ?? '';
  return original
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
    .replace('</head>', `${themeStyleTag()}\n${acquireShimScript(session.id, nonce)}\n</head>`)
    .replace('<body>', '<body class="vscode-dark" data-vscode-theme-kind="vscode-dark">');
}

function serveEvents(req, res, id) {
  const session = sessions.get(id);
  if (session === undefined) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  session.response = res;
  session.queue.splice(0).forEach((data) => res.write(data));
  req.on('close', () => {
    session.host.dispose();
    sessions.delete(id);
  });
}

function receiveRpc(req, res, id) {
  const session = sessions.get(id);
  const chunks = [];
  req.on('data', (chunk) => chunks.push(chunk));
  req.on('end', () => {
    if (session === undefined) {
      res.writeHead(404).end();
      return;
    }
    session.host.receive(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    res.writeHead(204).end();
  });
}

function serveAsset(res, pathname) {
  const file = normalize(join(repoRoot, pathname));
  const distRoot = join(repoRoot, 'dist', 'webview');
  if (!file.startsWith(distRoot) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

const host = await bundleHost();
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/') {
      await servePage(res, host, url);
    } else if (url.pathname.startsWith('/events/')) {
      serveEvents(req, res, url.pathname.slice('/events/'.length));
    } else if (url.pathname.startsWith('/rpc/') && req.method === 'POST') {
      receiveRpc(req, res, url.pathname.slice('/rpc/'.length));
    } else {
      serveAsset(res, url.pathname);
    }
  } catch (error) {
    console.error(error);
    res.writeHead(500).end(String(error));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Harness: http://localhost:${PORT}/?project=${process.env.GW_PROJECT ?? '<id>'}&branch=${process.env.GW_BRANCH ?? '<branch>'}  (panel ${SERVER_URL}, token ${TOKEN ? 'set' : 'MISSING'})`);
});
