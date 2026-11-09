import * as vscode from 'vscode';
import type { PanelBootstrap } from '../shared/protocol';

export const WEBVIEW_DIST_SEGMENTS = ['dist', 'webview'] as const;

type PanelWebview = Pick<vscode.Webview, 'asWebviewUri' | 'cspSource'>;

export function buildPanelHtml(webview: PanelWebview, extensionUri: vscode.Uri, nonce: string, bootstrap: PanelBootstrap): string {
  const asset = (file: string): string => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...WEBVIEW_DIST_SEGMENTS, file)).toString();
  return `<!DOCTYPE html>
<html lang="${bootstrap.locale}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${contentSecurityPolicy(webview.cspSource, nonce)}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${asset('codicon.css')}">
<link rel="stylesheet" href="${asset('main.css')}">
<title>Workspace Control</title>
</head>
<body>
<div id="root"></div>
<script type="application/json" id="gw-bootstrap" nonce="${nonce}">${serializeBootstrap(bootstrap)}</script>
<script type="module" nonce="${nonce}" src="${asset('main.js')}"></script>
</body>
</html>`;
}

// Mermaid writes inline <style> into its SVGs and cannot take a nonce, so styles need 'unsafe-inline'.
// Scripts stay nonce-bound; cspSource is required for the esbuild chunks loaded through import().
function contentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    `default-src 'none'`,
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
    `style-src ${cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}' ${cspSource};`,
  ].join('; ');
}

// Escaping "<" keeps branch names or state text from closing the JSON script element early.
function serializeBootstrap(bootstrap: PanelBootstrap): string {
  return JSON.stringify(bootstrap).replace(/</g, '\\u003c');
}
