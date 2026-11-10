import { ApiClient } from '../../src/api/client';
import { Settings } from '../../src/config/settings';
import { WorkspaceLocator } from '../../src/fs/workspaceLocator';
import { registerControlPanel } from '../../src/webview/controlPanel';
import { ActiveWorkspace } from '../../src/state/activeWorkspace';
import { Uri } from 'vscode';

const FIRST_STATE_TIMEOUT_MS = 8000;
const mementosByBrowser = new Map();

export function startHarnessSession({ repoRoot, serverUrl, token, project, branch, browserId, onMessage }) {
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
  const globalState = browserMemento(browserId);
  const host = registerControlPanel({ extensionUri, subscriptions: [], globalState }, { client, active, locator });
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

// One memento per browser (cookie), so the remembered tab survives page reloads like VS Code globalState survives
// panel reopening, while parallel QA browser contexts never see each other's remembered tabs.
function browserMemento(browserId) {
  if (!mementosByBrowser.has(browserId)) {
    mementosByBrowser.set(browserId, createMemoryMemento());
  }
  return mementosByBrowser.get(browserId);
}

function createMemoryMemento() {
  const values = new Map();
  return {
    keys: () => [...values.keys()],
    get: (key, defaultValue) => (values.has(key) ? values.get(key) : defaultValue),
    update: async (key, value) => {
      values.set(key, value);
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
    // A real panel the user is looking at is visible and active, which selects the poller's fast interval.
    visible: true,
    active: true,
    reveal() {},
    dispose() {},
    onDidChangeViewState: () => ({ dispose() {} }),
    onDidDispose: (handler) => {
      disposeHandlers.push(handler);
      return { dispose() {} };
    },
    fireDispose: () => disposeHandlers.forEach((handler) => handler()),
  };
}
