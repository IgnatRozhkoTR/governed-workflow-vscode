import * as vscode from 'vscode';

export type TerminalLayout = 'panel' | 'editor' | 'fullscreen';

export const TERMINAL_LAYOUTS: readonly TerminalLayout[] = ['panel', 'editor', 'fullscreen'];

const CONFIG_SECTION = 'governedWorkflow';
const LAYOUT_KEY = 'terminal.layout';
const LEGACY_MAXIMIZE_KEY = 'terminal.maximize';
const DEFAULT_LAYOUT: TerminalLayout = 'editor';
const MOVE_TO_PANEL_COMMAND = 'workbench.action.terminal.moveToTerminalPanel';
const MOVE_TO_EDITOR_COMMAND = 'workbench.action.terminal.moveToEditor';
const TOGGLE_MAXIMIZE_GROUP_COMMAND = 'workbench.action.toggleMaximizeEditorGroup';
const MIN_GROUPS_TO_MAXIMIZE = 2;

interface Inspection<T> {
  readonly globalValue?: T;
  readonly workspaceValue?: T;
  readonly workspaceFolderValue?: T;
}

export function isTerminalLayout(value: unknown): value is TerminalLayout {
  return typeof value === 'string' && (TERMINAL_LAYOUTS as readonly string[]).includes(value);
}

// An unset layout falls back to the deprecated terminal.maximize, so users who turned maximise on keep a full-screen terminal.
export function readTerminalLayout(): TerminalLayout {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const configured = explicitValue(configuration.inspect<unknown>(LAYOUT_KEY));
  if (isTerminalLayout(configured)) {
    return configured;
  }
  return explicitValue(configuration.inspect<unknown>(LEGACY_MAXIMIZE_KEY)) === true ? 'fullscreen' : DEFAULT_LAYOUT;
}

export async function writeTerminalLayout(layout: TerminalLayout): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const hasWorkspaceValue = configuration.inspect<unknown>(LAYOUT_KEY)?.workspaceValue !== undefined;
  const target = hasWorkspaceValue ? vscode.ConfigurationTarget.Workspace : vscode.ConfigurationTarget.Global;
  await configuration.update(LAYOUT_KEY, layout, target);
}

function explicitValue<T>(inspection: Inspection<T> | undefined): T | undefined {
  return inspection?.workspaceFolderValue ?? inspection?.workspaceValue ?? inspection?.globalValue;
}

function isInEditorArea(terminal: vscode.Terminal): boolean {
  return vscode.window.tabGroups.all.some((group) =>
    group.tabs.some((tab) => tab.input instanceof vscode.TabInputTerminal && tab.label === terminal.name),
  );
}

// Places the Claude terminal for a layout. Moves go through the workbench commands so the pty, and with it the tmux
// attach, survives. VS Code offers no API to read whether an editor group is maximised (the editorPartMaximizedEditorGroup
// context key is not readable by extensions) and only a toggle command, so this tracks the maximise it performed and
// only ever undoes that one.
export class TerminalPlacement {
  private hasMaximizedGroup = false;

  creationLocation(layout: TerminalLayout): vscode.TerminalLocation | vscode.TerminalEditorLocationOptions {
    return layout === 'panel' ? vscode.TerminalLocation.Panel : { viewColumn: vscode.ViewColumn.Active };
  }

  async present(terminal: vscode.Terminal, layout: TerminalLayout): Promise<void> {
    terminal.show(false);
    if (layout === 'fullscreen') {
      await this.maximizeActiveGroup();
    } else {
      await this.restoreGroups();
    }
  }

  // Restoring first matters: once the terminal leaves a maximised group that held only it, VS Code closes the group and
  // drops the maximise itself, and the toggle would then maximise whichever group is left.
  async moveTo(terminal: vscode.Terminal, layout: TerminalLayout): Promise<void> {
    if (layout !== 'fullscreen') {
      await this.restoreGroups();
    }
    const belongsInEditor = layout !== 'panel';
    if (isInEditorArea(terminal) !== belongsInEditor) {
      terminal.show(false);
      await vscode.commands.executeCommand(belongsInEditor ? MOVE_TO_EDITOR_COMMAND : MOVE_TO_PANEL_COMMAND);
    }
    await this.present(terminal, layout);
  }

  async restoreGroups(): Promise<void> {
    if (!this.hasMaximizedGroup) {
      return;
    }
    await vscode.commands.executeCommand(TOGGLE_MAXIMIZE_GROUP_COMMAND);
    this.hasMaximizedGroup = false;
  }

  private async maximizeActiveGroup(): Promise<void> {
    if (this.hasMaximizedGroup || vscode.window.tabGroups.all.length < MIN_GROUPS_TO_MAXIMIZE) {
      return;
    }
    await vscode.commands.executeCommand(TOGGLE_MAXIMIZE_GROUP_COMMAND);
    this.hasMaximizedGroup = true;
  }
}
