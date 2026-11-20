import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { WorkspaceRef } from '../src/api/types';
import { readTerminalLayout, TerminalPlacement, writeTerminalLayout } from '../src/terminal/terminalLayout';
import { registerTerminalLayout, TERMINAL_LAYOUT_COMMANDS } from '../src/terminal/terminalLayoutCommands';
import { useTerminalSettings, type FakeTerminalConfiguration } from './support/terminalLayoutConfig';
import { COMMANDS, executedCommands, terminalTab, useTabGroups } from './support/terminalTabs';
import { tabGroupsEmitter } from './vscodeStub';

const REF = { projectId: 1, branch: 'feature/x' } as WorkspaceRef;

const terminal = { name: 'Claude: feature/x', show: vi.fn() };
let terminalFor: ReturnType<typeof vi.fn>;
let activeWorkspace: { workspace: WorkspaceRef | undefined; onDidChange: ReturnType<typeof vi.fn> };
let handlers: Map<string, () => Promise<void>>;
let settings: FakeTerminalConfiguration;
let placement: TerminalPlacement;

function terminalInEditor(): void {
  useTabGroups({ tabs: [terminalTab(terminal.name)], isActive: true }, { tabs: [] });
}

function terminalInPanel(): void {
  useTabGroups({ tabs: [], isActive: true }, { tabs: [] });
}

function run(command: string): Promise<void> {
  const handler = handlers.get(command);
  if (handler === undefined) {
    throw new Error(`command not registered: ${command}`);
  }
  return handler();
}

async function enterFullScreenThenClearCalls(): Promise<void> {
  await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);
  vi.mocked(vscode.commands.executeCommand).mockClear();
}

function register(): void {
  registerTerminalLayout({ subscriptions: [] } as never, {
    placement,
    terminals: { terminalFor } as never,
    activeWorkspace: activeWorkspace as never,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  handlers = new Map();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: never) => {
    handlers.set(id, handler);
    return { dispose: vi.fn() };
  }) as never);
  terminalFor = vi.fn(() => terminal);
  activeWorkspace = { workspace: REF, onDidChange: vi.fn(() => ({ dispose: vi.fn() })) };
  settings = useTerminalSettings({ layout: 'panel' });
  placement = new TerminalPlacement();
  terminalInEditor();
});

afterEach(() => {
  placement.dispose();
});

describe('readTerminalLayout', () => {
  it('readTerminalLayout_shouldDefaultToFullscreen_whenNothingIsSet', () => {
    useTerminalSettings({});

    expect(readTerminalLayout()).toBe('fullscreen');
  });

  it('readTerminalLayout_shouldMigrateToFullscreen_whenRetiredEditorLayoutIsSet', () => {
    useTerminalSettings({ layout: 'editor' });

    expect(readTerminalLayout()).toBe('fullscreen');
  });

  it('readTerminalLayout_shouldMigrateToFullscreen_whenOnlyRetiredMaximizeIsSet', () => {
    useTerminalSettings({ maximize: false });

    expect(readTerminalLayout()).toBe('fullscreen');
  });

  it('readTerminalLayout_shouldKeepPanel_whenPanelIsSet', () => {
    useTerminalSettings({ layout: 'panel', maximize: true });

    expect(readTerminalLayout()).toBe('panel');
  });

  it('readTerminalLayout_shouldPreferWorkspaceValue_whenBothScopesAreSet', () => {
    useTerminalSettings({ layout: 'fullscreen', workspaceLayout: 'panel' });

    expect(readTerminalLayout()).toBe('panel');
  });
});

describe('writeTerminalLayout', () => {
  it('writeTerminalLayout_shouldWriteUserSettings_whenNoWorkspaceOverride', async () => {
    await writeTerminalLayout('fullscreen');

    expect(settings.update).toHaveBeenCalledWith('terminal.layout', 'fullscreen', vscode.ConfigurationTarget.Global);
    expect(readTerminalLayout()).toBe('fullscreen');
  });

  it('writeTerminalLayout_shouldWriteWorkspaceSettings_whenWorkspaceOverridesLayout', async () => {
    settings = useTerminalSettings({ layout: 'fullscreen', workspaceLayout: 'fullscreen' });

    await writeTerminalLayout('panel');

    expect(settings.update).toHaveBeenCalledWith('terminal.layout', 'panel', vscode.ConfigurationTarget.Workspace);
    expect(readTerminalLayout()).toBe('panel');
  });
});

describe('layout switching', () => {
  it('switchTo_shouldMaximizeAndHideSideBars_whenTerminalIsAlreadyInEditor', async () => {
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(settings.values.layout).toBe('fullscreen');
    expect(terminal.show).toHaveBeenCalledWith(false);
    expect(executedCommands()).toEqual([COMMANDS.maximizeHideSideBars]);
  });

  it('switchTo_shouldMoveToEditorThenMaximize_whenPanelToFullscreen', async () => {
    terminalInPanel();
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(executedCommands()).toEqual([COMMANDS.moveToEditor, COMMANDS.maximizeHideSideBars]);
  });

  it('switchTo_shouldActivateTerminalGroupFirst_whenAnotherGroupIsActive', async () => {
    useTabGroups({ tabs: [] , isActive: true }, { tabs: [terminalTab(terminal.name)] });
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(executedCommands()).toEqual([COMMANDS.focusSecondGroup, COMMANDS.maximizeHideSideBars]);
  });

  it('switchTo_shouldRestoreGroupsAndSideBarBeforeMoving_whenFullscreenToPanel', async () => {
    register();
    await enterFullScreenThenClearCalls();

    await run(TERMINAL_LAYOUT_COMMANDS.panel);

    expect(settings.values.layout).toBe('panel');
    expect(executedCommands()).toEqual([COMMANDS.toggleMaximizeGroup, COMMANDS.showSideBar, COMMANDS.moveToPanel]);
  });

  it('switchTo_shouldOnlyReopenSideBar_whenSingleGroupWasNotMaximized', async () => {
    useTabGroups({ tabs: [terminalTab(terminal.name)], isActive: true });
    register();
    await enterFullScreenThenClearCalls();

    await run(TERMINAL_LAYOUT_COMMANDS.panel);

    expect(executedCommands()).toEqual([COMMANDS.showSideBar, COMMANDS.moveToPanel]);
  });

  it('switchTo_shouldNotToggleMaximize_whenVsCodeDroppedItAfterAnotherGroupActivated', async () => {
    const [terminalGroup, otherGroup] = useTabGroups({ tabs: [terminalTab(terminal.name)], isActive: true }, { tabs: [] });
    register();
    await enterFullScreenThenClearCalls();
    terminalGroup.isActive = false;
    otherGroup.isActive = true;
    tabGroupsEmitter.fire({});

    await run(TERMINAL_LAYOUT_COMMANDS.panel);

    expect(executedCommands()).toEqual([COMMANDS.showSideBar, COMMANDS.moveToPanel]);
  });

  it('switchTo_shouldNotRestoreLayout_whenFullscreenWasNeverEntered', async () => {
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.panel);

    expect(executedCommands()).toEqual([COMMANDS.moveToPanel]);
  });

  it('switchTo_shouldOnlyRememberLayout_whenTerminalIsNotOpen', async () => {
    terminalFor.mockReturnValue(undefined);
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(settings.values.layout).toBe('fullscreen');
    expect(terminal.show).not.toHaveBeenCalled();
    expect(executedCommands()).toEqual([]);
  });

  it('toggleFullScreen_shouldSwitchBetweenPanelAndFullscreen_whenToggledTwice', async () => {
    terminalInPanel();
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.toggleFullScreen);
    expect(settings.values.layout).toBe('fullscreen');
    terminalInEditor();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await run(TERMINAL_LAYOUT_COMMANDS.toggleFullScreen);

    expect(settings.values.layout).toBe('panel');
    expect(executedCommands()).toEqual([COMMANDS.toggleMaximizeGroup, COMMANDS.showSideBar, COMMANDS.moveToPanel]);
  });

  it('pick_shouldOfferTwoLayoutsAndApplySelection', async () => {
    settings = useTerminalSettings({ layout: 'editor' });
    vi.mocked(vscode.window.showQuickPick).mockImplementation((async (items: { label: string }[]) => {
      expect(items.map((item) => item.label)).toEqual(['$(check) Full screen', 'Panel']);
      return items[1];
    }) as never);
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.pick);

    expect(settings.values.layout).toBe('panel');
    expect(executedCommands()).toEqual([COMMANDS.moveToPanel]);
  });

  it('register_shouldNotRegisterEditorLayoutCommand', () => {
    register();

    expect([...handlers.keys()]).not.toContain('governedWorkflow.terminalLayoutEditor');
  });
});

describe('TerminalPlacement.hide', () => {
  it('hide_shouldShowPreviousEditorAndLeaveFullScreen_whenTerminalIsInEditor', async () => {
    await placement.present(terminal as never, 'fullscreen');
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await placement.hide(terminal as never);

    expect(executedCommands()).toEqual([
      COMMANDS.showPreviousEditor,
      COMMANDS.toggleMaximizeGroup,
      COMMANDS.showSideBar,
      COMMANDS.focusActiveGroup,
    ]);
  });

  it('hide_shouldToggleTerminalView_whenTerminalIsInPanel', async () => {
    terminalInPanel();

    await placement.hide(terminal as never);

    expect(executedCommands()).toEqual([COMMANDS.toggleTerminalView]);
  });
});

describe('layout status bar item', () => {
  it('statusItem_shouldShowFullScreen_whenRetiredEditorLayoutIsSet', () => {
    const before = vscode.statusBarItems.length;
    settings = useTerminalSettings({ layout: 'editor' });

    register();

    const item = vscode.statusBarItems[before];
    expect(item.text).toBe('$(terminal) Claude: Full screen');
    expect(item.command).toBe(TERMINAL_LAYOUT_COMMANDS.pick);
    expect(item.isVisible).toBe(true);
  });

  it('statusItem_shouldHide_whenNoWorkspaceIsActive', () => {
    const before = vscode.statusBarItems.length;
    activeWorkspace.workspace = undefined;

    register();

    expect(vscode.statusBarItems[before].isVisible).toBe(false);
  });
});
