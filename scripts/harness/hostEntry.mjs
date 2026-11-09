import { ApiClient } from '../../src/api/client';
import { Settings } from '../../src/config/settings';
import { WorkspaceLocator } from '../../src/fs/workspaceLocator';
import { registerControlPanel } from '../../src/webview/controlPanel';
import { ActiveWorkspace } from '../../src/state/activeWorkspace';
import { Uri } from 'vscode';

const FIRST_STATE_TIMEOUT_MS = 8000;

export function startHarnessSession({ repoRoot, serverUrl, token, project, branch, onMessage }) {
  const extensionUri = Uri.file(repoRoot);
  const settings = new Settings();
  const client = new ApiClient(() => serverUrl, async () => token);
  const active = new ActiveWorkspace(client, settings);
  const locator = new WorkspaceLocator();
  const handlers = [];
  let panel;
  globalThis.__harnessCreateWebviewPanel = () => {
    panel = createFakePanel(extensionUri, onMessage, handlers);
    return panel;
  };
  const host = registerControlPanel({ extensionUri, subscriptions: [] }, { client, active, locator });
  const firstState = waitForFirstState(active);
  active.select({ projectId: project, branch });
  host.createOrShow();
  return {
    html: () => panel.webview.html,
    firstState,
    receive: (message) => handlers.forEach((handler) => handler(message)),
    dispose: () => {
      panel.fireDispose();
      active.dispose();
      settings.dispose();
    },
  };
}

function waitForFirstState(active) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), FIRST_STATE_TIMEOUT_MS);
    active.onDidChangeState(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function createFakePanel(extensionUri, onMessage, handlers) {
  const disposeHandlers = [];
  const webview = {
    options: {},
    html: '',
    cspSource: "'self'",
    asWebviewUri: (uri) => ({ toString: () => uri.path.slice(extensionUri.path.length) }),
    postMessage: async (message) => {
      onMessage(message);
      return true;
    },
    onDidReceiveMessage: (handler) => {
      handlers.push(handler);
      return { dispose() {} };
    },
  };
  return {
    webview,
    title: '',
    iconPath: undefined,
    reveal() {},
    dispose() {},
    onDidDispose: (handler) => {
      disposeHandlers.push(handler);
      return { dispose() {} };
    },
    fireDispose: () => disposeHandlers.forEach((handler) => handler()),
  };
}
