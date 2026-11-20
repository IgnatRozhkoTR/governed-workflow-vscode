import * as vscode from 'vscode';
import { createNonce } from '../webview/nonce';

const READER_VIEW_TYPE = 'governedWorkflow.clipboardReader';
const READER_TITLE = 'Paste Image';
const READER_TIMEOUT_MS = 5000;
const READER_FOCUS_WAIT_MS = 2000;

export interface ClipboardImage {
  readonly bytes: Uint8Array;
  readonly mime: string;
}

export type ClipboardImageRead =
  | { readonly kind: 'image'; readonly image: ClipboardImage }
  | { readonly kind: 'none' }
  | { readonly kind: 'unavailable'; readonly reason: string };

// Over Remote-SSH the extension host runs on the code's machine and VS Code has no image clipboard API, but webviews
// render on the user's machine, so a webview reads the user's clipboard. Chromium reads it only in a focused
// document, which is why the reader opens as a focused tab for the moment of the read.
export async function readClientClipboardImage(): Promise<ClipboardImageRead> {
  const panel = vscode.window.createWebviewPanel(
    READER_VIEW_TYPE,
    READER_TITLE,
    { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
    { enableScripts: true, localResourceRoots: [] },
  );
  try {
    const reply = nextReaderReply(panel);
    panel.webview.html = readerHtml(createNonce());
    return await reply;
  } finally {
    panel.dispose();
  }
}

function nextReaderReply(panel: vscode.WebviewPanel): Promise<ClipboardImageRead> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(unavailable('the clipboard reader did not answer')), READER_TIMEOUT_MS);
    const settle = (read: ClipboardImageRead): void => {
      clearTimeout(timer);
      resolve(read);
    };
    panel.webview.onDidReceiveMessage((message: unknown) => settle(parseReaderReply(message)));
    panel.onDidDispose(() => settle(unavailable('the clipboard reader was closed')));
  });
}

export function parseReaderReply(message: unknown): ClipboardImageRead {
  if (typeof message !== 'object' || message === null) {
    return unavailable('unexpected reply from the clipboard reader');
  }
  const reply = message as Record<string, unknown>;
  if (reply.kind === 'none') {
    return { kind: 'none' };
  }
  if (reply.kind === 'image' && typeof reply.mime === 'string' && reply.mime.startsWith('image/') && typeof reply.base64 === 'string') {
    return { kind: 'image', image: { bytes: Buffer.from(reply.base64, 'base64'), mime: reply.mime } };
  }
  if (reply.kind === 'unavailable' && typeof reply.reason === 'string') {
    return unavailable(reply.reason);
  }
  return unavailable('unexpected reply from the clipboard reader');
}

function unavailable(reason: string): ClipboardImageRead {
  return { kind: 'unavailable', reason };
}

function readerHtml(nonce: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<style nonce="${nonce}">body { font-family: var(--vscode-font-family); color: var(--vscode-descriptionForeground); }</style>
</head>
<body>
<p>Reading the clipboard…</p>
<script nonce="${nonce}">
const vscodeApi = acquireVsCodeApi();

function whenFocused() {
  return new Promise((resolve) => {
    if (document.hasFocus()) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ${READER_FOCUS_WAIT_MS});
    window.addEventListener('focus', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function readImage() {
  await whenFocused();
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const mime = item.types.find((type) => type.startsWith('image/'));
    if (mime !== undefined) {
      return { kind: 'image', mime, base64: await toBase64(await item.getType(mime)) };
    }
  }
  return { kind: 'none' };
}

readImage().then(
  (reply) => vscodeApi.postMessage(reply),
  (error) => vscodeApi.postMessage({ kind: 'unavailable', reason: String((error && error.message) || error) }),
);
</script>
</body>
</html>`;
}
