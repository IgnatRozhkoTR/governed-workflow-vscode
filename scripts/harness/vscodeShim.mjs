const nativeLog = [];
let logSink = (line) => console.log(`[native] ${line}`);

export function setNativeLogSink(sink) {
  logSink = sink;
}

function logNative(kind, detail) {
  const line = `${kind} ${detail}`;
  nativeLog.push(line);
  logSink(line);
}

function describe(value) {
  try {
    return JSON.stringify(value, (key, entry) => (entry instanceof Uri ? entry.toString() : entry));
  } catch {
    return String(value);
  }
}

export class Uri {
  constructor(scheme, authority, path, query, fragment) {
    this.scheme = scheme;
    this.authority = authority ?? '';
    this.path = path ?? '';
    this.query = query ?? '';
    this.fragment = fragment ?? '';
  }

  get fsPath() {
    return this.path;
  }

  static file(path) {
    return new Uri('file', '', path);
  }

  static from(parts) {
    return new Uri(parts.scheme, parts.authority, parts.path, parts.query, parts.fragment);
  }

  static parse(value) {
    const url = new URL(value);
    return new Uri(url.protocol.replace(/:$/, ''), url.host, url.pathname, url.search.replace(/^\?/, ''), url.hash.replace(/^#/, ''));
  }

  static joinPath(base, ...segments) {
    const joined = [base.path, ...segments].join('/').replace(/\/+/g, '/');
    return new Uri(base.scheme, base.authority, joined, base.query, base.fragment);
  }

  with(change) {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  toString() {
    const query = this.query === '' ? '' : `?${this.query}`;
    return `${this.scheme}://${this.authority}${this.path}${query}`;
  }
}

export class Range {
  constructor(startLine, startCharacter, endLine, endCharacter) {
    this.start = { line: startLine, character: startCharacter };
    this.end = { line: endLine, character: endCharacter };
  }
}

export class EventEmitter {
  listeners = [];

  event = (listener) => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((entry) => entry !== listener); } };
  };

  fire(value) {
    [...this.listeners].forEach((listener) => listener(value));
  }

  dispose() {
    this.listeners = [];
  }
}

const noopDisposable = { dispose() {} };
const windowStateEmitter = new EventEmitter();

export const window = {
  state: { focused: true },
  onDidChangeWindowState: windowStateEmitter.event,
  createWebviewPanel: (...args) => globalThis.__harnessCreateWebviewPanel(...args),
  registerWebviewPanelSerializer: () => noopDisposable,
  showTextDocument: async (uri, options) => logNative('openFile', `${uri.toString()} ${describe(options?.selection ?? '')}`),
  showInformationMessage: async (message) => logNative('info', message),
  showWarningMessage: async (message) => logNative('warning', message),
  showErrorMessage: async (message) => logNative('error', message),
  showQuickPick: async (items) => logNative('quickPick', `${Array.isArray(items) ? items.length : '?'} items, nothing picked`),
  showSaveDialog: async (options) => logNative('saveFile', `dialog for ${options?.defaultUri?.toString() ?? ''}, cancelled`),
};

export const commands = {
  executeCommand: async (command, ...args) => logNative('command', `${command} ${describe(args)}`),
  getCommands: async () => [],
};

export const env = {
  clipboard: { writeText: async (text) => logNative('copy', `${text.length} chars: ${text.slice(0, 120)}`) },
  openExternal: async (uri) => logNative('openExternal', uri.toString()),
};

export const workspace = {
  workspaceFolders: undefined,
  getConfiguration: () => ({ get: (_key, fallback) => fallback }),
  onDidChangeConfiguration: () => noopDisposable,
  registerTextDocumentContentProvider: () => noopDisposable,
  fs: { writeFile: async (uri, bytes) => logNative('writeFile', `${uri.toString()} ${bytes.length} bytes`) },
};

export const ViewColumn = { Active: -1 };
export const Disposable = class { constructor(fn) { this.dispose = fn; } };
