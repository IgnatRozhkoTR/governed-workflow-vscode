import { vi } from 'vitest';

type Listener<T> = (value: T) => unknown;

export interface Disposable {
  dispose(): void;
}

export class EventEmitter<T> implements Disposable {
  private listeners: Listener<T>[] = [];

  readonly event = (listener: Listener<T>): Disposable => {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((entry) => entry !== listener); } };
  };

  fire(value: T): void {
    [...this.listeners].forEach((listener) => listener(value));
  }

  dispose(): void {
    this.listeners = [];
  }
}

const windowStateEmitter = new EventEmitter<{ focused: boolean }>();

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly path: string,
    readonly authority = '',
    readonly query = '',
  ) {}

  static from(components: { scheme: string; authority?: string; path?: string; query?: string }): Uri {
    return new Uri(components.scheme, components.path ?? '', components.authority ?? '', components.query ?? '');
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }

  static parse(value: string): Uri {
    const separator = value.indexOf(':');
    return new Uri(value.slice(0, separator), value.slice(separator + 1));
  }

  static joinPath(base: Uri, ...segments: string[]): Uri {
    return new Uri(base.scheme, [base.path.replace(/\/$/, ''), ...segments].join('/'));
  }

  get fsPath(): string {
    return this.path;
  }

  toString(): string {
    return `${this.scheme}:${this.path}`;
  }
}

export class Position {
  constructor(
    readonly line: number,
    readonly character: number,
  ) {}
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
    this.start = new Position(startLine, startCharacter);
    this.end = new Position(endLine, endCharacter);
  }

  isEqual(other: Range): boolean {
    return this.start.line === other.start.line && this.end.line === other.end.line
      && this.start.character === other.start.character && this.end.character === other.end.character;
  }
}

export class Selection {
  constructor(
    readonly anchor: Position,
    readonly active: Position,
  ) {}
}

export class MarkdownString {
  constructor(readonly value: string) {}
}

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;
export const ExtensionKind = { UI: 1, Workspace: 2 } as const;
export type ExtensionKind = (typeof ExtensionKind)[keyof typeof ExtensionKind];

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;
export const CommentThreadState = { Unresolved: 0, Resolved: 1 } as const;
export const CommentThreadCollapsibleState = { Collapsed: 0, Expanded: 1 } as const;
export const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: string;
  contextValue?: string;
  command?: unknown;
  iconPath?: unknown;
  resourceUri?: Uri;

  constructor(readonly label: string, readonly collapsibleState: number = TreeItemCollapsibleState.None) {}
}
export class ThemeIcon {
  static readonly Folder = new ThemeIcon('folder');

  constructor(readonly id: string) {}
}
export class ThemeColor {
  constructor(readonly id: string) {}
}
export class FileDecoration {
  constructor(readonly badge?: string, readonly tooltip?: string, readonly color?: ThemeColor) {}
}
export const CommentMode = { Editing: 0, Preview: 1 } as const;

export interface FakeStatusBarItem {
  text: string;
  tooltip: string;
  command: string;
  isVisible: boolean;
  isDisposed: boolean;
  show(): void;
  hide(): void;
  dispose(): void;
}

export const statusBarItems: FakeStatusBarItem[] = [];

function createStatusBarItem(): FakeStatusBarItem {
  const item: FakeStatusBarItem = {
    text: '',
    tooltip: '',
    command: '',
    isVisible: false,
    isDisposed: false,
    show: () => { item.isVisible = true; },
    hide: () => { item.isVisible = false; },
    dispose: () => { item.isDisposed = true; },
  };
  statusBarItems.push(item);
  return item;
}

export const window = {
  state: { focused: true },
  onDidChangeWindowState: windowStateEmitter.event,
  createStatusBarItem,
  showSaveDialog: vi.fn(),
  showQuickPick: vi.fn(),
  showInputBox: vi.fn(),
  showWarningMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  showTextDocument: vi.fn(),
  createTerminal: vi.fn(),
  tabGroups: { all: [] as { tabs: FakeTab[] }[] },
  onDidCloseTerminal: vi.fn(),
  withProgress: vi.fn((_options: unknown, task: () => unknown) => task()),
};

export const ViewColumn = { Active: -1 };
export const TerminalLocation = { Panel: 1, Editor: 2 } as const;

export class TabInputTerminal {}

export interface FakeTab {
  readonly label: string;
  readonly input: unknown;
}

export const commands = {
  executeCommand: vi.fn(),
  registerCommand: vi.fn(),
  getCommands: vi.fn(async () => [] as string[]),
};

export const workspace = {
  workspaceFolders: undefined as { uri: Uri }[] | undefined,
  textDocuments: [] as unknown[],
  fs: { writeFile: vi.fn() },
  openTextDocument: vi.fn(),
  getConfiguration: vi.fn(),
  onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
};

export const extensions = {
  getExtension: vi.fn(),
};

export const env = {
  remoteName: undefined as string | undefined,
  clipboard: { writeText: vi.fn() },
  openExternal: vi.fn(),
};

export function setWindowFocus(focused: boolean): void {
  window.state = { focused };
  windowStateEmitter.fire(window.state);
}
