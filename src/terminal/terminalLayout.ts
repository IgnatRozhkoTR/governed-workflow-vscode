import * as vscode from 'vscode';

export type TerminalLayout = 'fullscreen' | 'panel';

export const TERMINAL_LAYOUTS: readonly TerminalLayout[] = ['fullscreen', 'panel'];

const CONFIG_SECTION = 'governedWorkflow';
const LAYOUT_KEY = 'terminal.layout';
const PANEL_LAYOUT: TerminalLayout = 'panel';
const MOVE_TO_PANEL_COMMAND = 'workbench.action.terminal.moveToTerminalPanel';
const MOVE_TO_EDITOR_COMMAND = 'workbench.action.terminal.moveToEditor';
const MAXIMIZE_HIDE_SIDE_BARS_COMMAND = 'workbench.action.maximizeEditorHideSidebar';
const TOGGLE_MAXIMIZE_GROUP_COMMAND = 'workbench.action.toggleMaximizeEditorGroup';
const SHOW_PRIMARY_SIDE_BAR_COMMAND = 'workbench.action.focusSideBar';
const SHOW_PREVIOUS_EDITOR_COMMAND = 'workbench.action.openPreviousRecentlyUsedEditorInGroup';
const FOCUS_ACTIVE_GROUP_COMMAND = 'workbench.action.focusActiveEditorGroup';
const TOGGLE_TERMINAL_VIEW_COMMAND = 'workbench.action.terminal.toggleTerminal';
const FOCUS_GROUP_BY_COLUMN_COMMANDS: readonly string[] = [
  'workbench.action.focusFirstEditorGroup',
  'workbench.action.focusSecondEditorGroup',
  'workbench.action.focusThirdEditorGroup',
  'workbench.action.focusFourthEditorGroup',
  'workbench.action.focusFifthEditorGroup',
  'workbench.action.focusSixthEditorGroup',
  'workbench.action.focusSeventhEditorGroup',
  'workbench.action.focusEighthEditorGroup',
];
const MIN_GROUPS_TO_MAXIMIZE = 2;

interface Inspection<T> {
  readonly globalValue?: T;
  readonly workspaceValue?: T;
  readonly workspaceFolderValue?: T;
}

// Only an explicit panel stays in the panel: the retired editor layout, an unset layout and the retired
// terminal.maximize flag all mean full screen now, so old settings migrate without being rewritten.
export function readTerminalLayout(): TerminalLayout {
  const configuration = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return explicitValue(configuration.inspect<unknown>(LAYOUT_KEY)) === PANEL_LAYOUT ? 'panel' : 'fullscreen';
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

function editorGroupOf(terminal: vscode.Terminal): vscode.TabGroup | undefined {
  return vscode.window.tabGroups.all.find((group) =>
    group.tabs.some((tab) => tab.input instanceof vscode.TabInputTerminal && tab.label === terminal.name),
  );
}

function isInEditorArea(terminal: vscode.Terminal): boolean {
  return editorGroupOf(terminal) !== undefined;
}

// Places, shows and hides the Claude terminal. Moves go through the workbench commands so the pty, and with it the
// tmux attach, survives. VS Code lets extensions neither read nor set the layout directly, only run commands, so this
// tracks the full screen it entered and only ever undoes that one. Maximising is idempotent; un-maximising is a
// toggle, so the maximised group is forgotten as soon as VS Code drops the maximise itself.
export class TerminalPlacement implements vscode.Disposable {
  private isFullScreen = false;
  private maximizedGroup: vscode.TabGroup | undefined;
  private readonly groupWatch = vscode.window.tabGroups.onDidChangeTabGroups(() => this.forgetDroppedMaximize());

  creationLocation(layout: TerminalLayout): vscode.TerminalLocation | vscode.TerminalEditorLocationOptions {
    return layout === 'panel' ? vscode.TerminalLocation.Panel : { viewColumn: vscode.ViewColumn.Active };
  }

  async present(terminal: vscode.Terminal, layout: TerminalLayout): Promise<void> {
    if (layout === 'panel') {
      await this.leaveFullScreen();
      terminal.show(false);
      return;
    }
    terminal.show(false);
    await this.enterFullScreen(terminal);
  }

  // Leaving full screen first matters: once the terminal leaves a maximised group that held only it, VS Code closes
  // the group and drops the maximise itself, and the toggle would then maximise whichever group is left.
  async moveTo(terminal: vscode.Terminal, layout: TerminalLayout): Promise<void> {
    if (layout === 'panel') {
      await this.leaveFullScreen();
    }
    const belongsInEditor = layout === 'fullscreen';
    if (isInEditorArea(terminal) !== belongsInEditor) {
      terminal.show(false);
      await vscode.commands.executeCommand(belongsInEditor ? MOVE_TO_EDITOR_COMMAND : MOVE_TO_PANEL_COMMAND);
    }
    await this.present(terminal, layout);
  }

  // A terminal editor cannot be hidden without closing it, which would end the attach, so full screen hides it
  // behind the editor used before it. In the panel, toggling the focused Terminal view hides the part it is docked in.
  async hide(terminal: vscode.Terminal): Promise<void> {
    if (!isInEditorArea(terminal)) {
      await vscode.commands.executeCommand(TOGGLE_TERMINAL_VIEW_COMMAND);
      return;
    }
    await vscode.commands.executeCommand(SHOW_PREVIOUS_EDITOR_COMMAND);
    await this.leaveFullScreen();
    await vscode.commands.executeCommand(FOCUS_ACTIVE_GROUP_COMMAND);
  }

  // The secondary side bar stays hidden: VS Code does not tell extensions whether a side bar was open before, and the
  // primary one is the side bar a window normally shows.
  async leaveFullScreen(): Promise<void> {
    if (!this.isFullScreen) {
      return;
    }
    this.isFullScreen = false;
    if (this.maximizedGroup !== undefined) {
      this.maximizedGroup = undefined;
      await vscode.commands.executeCommand(TOGGLE_MAXIMIZE_GROUP_COMMAND);
    }
    await vscode.commands.executeCommand(SHOW_PRIMARY_SIDE_BAR_COMMAND);
  }

  dispose(): void {
    this.groupWatch.dispose();
  }

  // The maximise command acts on the active group, and showing an editor terminal does not always activate its group.
  private async enterFullScreen(terminal: vscode.Terminal): Promise<void> {
    await this.activateGroupOf(terminal);
    await vscode.commands.executeCommand(MAXIMIZE_HIDE_SIDE_BARS_COMMAND);
    this.isFullScreen = true;
    const { all, activeTabGroup } = vscode.window.tabGroups;
    this.maximizedGroup = all.length >= MIN_GROUPS_TO_MAXIMIZE ? activeTabGroup : undefined;
  }

  private async activateGroupOf(terminal: vscode.Terminal): Promise<void> {
    const group = editorGroupOf(terminal);
    const focusCommand = group === undefined || group.isActive ? undefined : FOCUS_GROUP_BY_COLUMN_COMMANDS[group.viewColumn - 1];
    if (focusCommand !== undefined) {
      await vscode.commands.executeCommand(focusCommand);
    }
  }

  // VS Code un-maximises on its own when another group becomes active or the maximised group closes.
  private forgetDroppedMaximize(): void {
    const group = this.maximizedGroup;
    if (group !== undefined && (!group.isActive || !vscode.window.tabGroups.all.includes(group))) {
      this.maximizedGroup = undefined;
    }
  }
}
