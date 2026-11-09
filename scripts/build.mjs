import { copyFile, mkdir, rm } from 'node:fs/promises';
import * as esbuild from 'esbuild';

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');
const WEBVIEW_OUT_DIR = 'dist/webview';
const CODICON_DIR = 'node_modules/@vscode/codicons/dist';
const CODICON_FILES = ['codicon.css', 'codicon.ttf'];

const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['vscode'],
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
};

const webviewOptions = {
  entryPoints: ['webview-ui/src/main.tsx'],
  outdir: WEBVIEW_OUT_DIR,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  jsx: 'automatic',
  jsxImportSource: 'preact',
  tsconfig: 'webview-ui/tsconfig.json',
  loader: { '.ttf': 'file' },
  define: { 'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development') },
  sourcemap: !isProduction,
  minify: isProduction,
  logLevel: 'info',
};

async function cleanWebviewOutput() {
  await rm(WEBVIEW_OUT_DIR, { recursive: true, force: true });
}

async function copyCodicons() {
  await mkdir(WEBVIEW_OUT_DIR, { recursive: true });
  await Promise.all(CODICON_FILES.map((file) => copyFile(`${CODICON_DIR}/${file}`, `${WEBVIEW_OUT_DIR}/${file}`)));
}

async function build() {
  await Promise.all([esbuild.build(extensionOptions), esbuild.build(webviewOptions)]);
}

async function watch() {
  const contexts = await Promise.all([esbuild.context(extensionOptions), esbuild.context(webviewOptions)]);
  await Promise.all(contexts.map((context) => context.watch()));
}

await cleanWebviewOutput();
await copyCodicons();
await (isWatch ? watch() : build());
