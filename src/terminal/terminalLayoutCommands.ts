import * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';
import type { ActiveWorkspaceSource } from './claudeTerminal';
import {
  readTerminalLayout,
  TERMINAL_LAYOUTS,
  writeTerminalLayout,
  type TerminalLayout,
  type TerminalPlacement,
} from './terminalLayout';

export const TERMINAL_LAYOUT_COMMANDS = {
  pick: 'governedWorkflow.terminalLayout',
  panel: 'governedWorkflow.terminalLayoutPanel',
  editor: 'governedWorkflow.terminalLayoutEditor',
  fullscreen: 'governedWorkflow.terminalLayoutFullScreen',
  toggleFullScreen: 'governedWorkflow.toggleTerminalFullScreen',
} as const;

const TERMINAL_SETTINGS_SECTION = 'governedWorkflow.terminal';
const STATUS_ITEM_ID = 'governedWorkflow.terminalLayout';
const STATUS_ITEM_PRIORITY = -100;
const DEFAULT_WINDOWED_LAYOUT: TerminalLayout = 'editor';

const LAYOUT_LABELS: Readonly<Record<TerminalLayout, string>> = {
  panel: 'Panel',
  editor: 'Editor',
  fullscreen: 'Full screen',
};

const LAYOUT_DESCRIPTIONS: Readonly<Record<TerminalLayout, string>> = {
  panel: 'bottom or right sidebar, drag to choose',
  editor: 'a tab in the editor area',
  fullscreen: 'editor tab with its group maximised',
};

export interface ClaudeTerminalLookup {
  terminalFor(ref: WorkspaceRef): vscode.Terminal | undefined;
}

export interface TerminalLayoutDeps {
  readonly placement: TerminalPlacement;
  readonly terminals: ClaudeTerminalLookup;
  readonly activeWorkspace: ActiveWorkspaceSource & { readonly onDidChange: vscode.Event<unknown> };
}

interface LayoutPickItem extends vscode.QuickPickItem {
  readonly layout: TerminalLayout;
}

export class TerminalLayoutSwitcher {
  private windowedLayout: TerminalLayout;

  constructor(private readonly deps: TerminalLayoutDeps) {
    const current = readTerminalLayout();
    this.windowedLayout = current === 'fullscreen' ? DEFAULT_WINDOWED_LAYOUT : current;
  }

  async switchTo(layout: TerminalLayout): Promise<void> {
    this.rememberWindowedLayout();
    await writeTerminalLayout(layout);
    const ref = this.deps.activeWorkspace.workspace;
    const terminal = ref === undefined ? undefined : this.deps.terminals.terminalFor(ref);
    if (terminal !== undefined) {
      await this.deps.placement.moveTo(terminal, layout);
    } else if (layout !== 'fullscreen') {
      await this.deps.placement.restoreGroups();
    }
  }

  async toggleFullScreen(): Promise<void> {
    await this.switchTo(readTerminalLayout() === 'fullscreen' ? this.windowedLayout : 'fullscreen');
  }

  async pick(): Promise<void> {
    const current = readTerminalLayout();
    const items: LayoutPickItem[] = TERMINAL_LAYOUTS.map((layout) => ({
      label: layout === current ? `$(check) ${LAYOUT_LABELS[layout]}` : LAYOUT_LABELS[layout],
      description: LAYOUT_DESCRIPTIONS[layout],
      layout,
    }));
    const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Claude terminal layout' });
    if (picked !== undefined) {
      await this.switchTo(picked.layout);
    }
  }

  private rememberWindowedLayout(): void {
    const current = readTerminalLayout();
    if (current !== 'fullscreen') {
      this.windowedLayout = current;
    }
  }
}

class TerminalLayoutStatusItem implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(STATUS_ITEM_ID, vscode.StatusBarAlignment.Right, STATUS_ITEM_PRIORITY);

  constructor(private readonly activeWorkspace: ActiveWorkspaceSource) {
    this.item.name = 'Claude Terminal Layout';
    this.item.tooltip = 'Claude terminal layout: click to change';
    this.item.command = TERMINAL_LAYOUT_COMMANDS.pick;
  }

  update(): void {
    this.item.text = `$(terminal) Claude: ${LAYOUT_LABELS[readTerminalLayout()]}`;
    if (this.activeWorkspace.workspace === undefined) {
      this.item.hide();
    } else {
      this.item.show();
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}

export function registerTerminalLayout(context: vscode.ExtensionContext, deps: TerminalLayoutDeps): void {
  const switcher = new TerminalLayoutSwitcher(deps);
  const status = new TerminalLayoutStatusItem(deps.activeWorkspace);
  status.update();
  context.subscriptions.push(
    status,
    deps.activeWorkspace.onDidChange(() => status.update()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(TERMINAL_SETTINGS_SECTION)) {
        status.update();
      }
    }),
    vscode.commands.registerCommand(TERMINAL_LAYOUT_COMMANDS.pick, () => switcher.pick()),
    vscode.commands.registerCommand(TERMINAL_LAYOUT_COMMANDS.panel, () => switcher.switchTo('panel')),
    vscode.commands.registerCommand(TERMINAL_LAYOUT_COMMANDS.editor, () => switcher.switchTo('editor')),
    vscode.commands.registerCommand(TERMINAL_LAYOUT_COMMANDS.fullscreen, () => switcher.switchTo('fullscreen')),
    vscode.commands.registerCommand(TERMINAL_LAYOUT_COMMANDS.toggleFullScreen, () => switcher.toggleFullScreen()),
  );
}
