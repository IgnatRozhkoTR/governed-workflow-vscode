import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { WorkspaceRef } from '../src/api/types';
import { readTerminalLayout, TerminalPlacement, writeTerminalLayout } from '../src/terminal/terminalLayout';
import { registerTerminalLayout, TERMINAL_LAYOUT_COMMANDS } from '../src/terminal/terminalLayoutCommands';
import { useTerminalSettings, type FakeTerminalConfiguration } from './support/terminalLayoutConfig';

const REF = { projectId: 1, branch: 'feature/x' } as WorkspaceRef;
const MOVE_TO_PANEL = 'workbench.action.terminal.moveToTerminalPanel';
const MOVE_TO_EDITOR = 'workbench.action.terminal.moveToEditor';
const TOGGLE_MAXIMIZE = 'workbench.action.toggleMaximizeEditorGroup';

const terminal = { name: 'Claude: feature/x', show: vi.fn() };
let terminalFor: ReturnType<typeof vi.fn>;
let activeWorkspace: { workspace: WorkspaceRef | undefined; onDidChange: ReturnType<typeof vi.fn> };
let handlers: Map<string, () => Promise<void>>;
let settings: FakeTerminalConfiguration;

function terminalInEditor(): void {
  vscode.window.tabGroups.all = [{ tabs: [{ label: terminal.name, input: new vscode.TabInputTerminal() }] }, { tabs: [] }];
}

function terminalInPanel(): void {
  vscode.window.tabGroups.all = [{ tabs: [] }, { tabs: [] }];
}

function executedCommands(): unknown[] {
  return vi.mocked(vscode.commands.executeCommand).mock.calls.map(([command]) => command);
}

function run(command: string): Promise<void> {
  const handler = handlers.get(command);
  if (handler === undefined) {
    throw new Error(`command not registered: ${command}`);
  }
  return handler();
}

function register(): void {
  registerTerminalLayout({ subscriptions: [] } as never, {
    placement: new TerminalPlacement(),
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
  settings = useTerminalSettings({ layout: 'editor' });
  terminalInEditor();
});

describe('readTerminalLayout', () => {
  it('readTerminalLayout_shouldDefaultToEditor_whenNothingIsSet', () => {
    useTerminalSettings({});

    expect(readTerminalLayout()).toBe('editor');
  });

  it('readTerminalLayout_shouldMigrateToFullscreen_whenLegacyMaximizeIsTrueAndLayoutUnset', () => {
    useTerminalSettings({ maximize: true });

    expect(readTerminalLayout()).toBe('fullscreen');
  });

  it('readTerminalLayout_shouldPreferLayout_whenBothSettingsAreSet', () => {
    useTerminalSettings({ layout: 'panel', maximize: true });

    expect(readTerminalLayout()).toBe('panel');
  });

  it('readTerminalLayout_shouldFallBackToLegacy_whenLayoutIsInvalid', () => {
    useTerminalSettings({ layout: 'sideways', maximize: false });

    expect(readTerminalLayout()).toBe('editor');
  });
});

describe('writeTerminalLayout', () => {
  it('writeTerminalLayout_shouldWriteUserSettings_whenNoWorkspaceOverride', async () => {
    await writeTerminalLayout('panel');

    expect(settings.update).toHaveBeenCalledWith('terminal.layout', 'panel', vscode.ConfigurationTarget.Global);
    expect(readTerminalLayout()).toBe('panel');
  });

  it('writeTerminalLayout_shouldWriteWorkspaceSettings_whenWorkspaceOverridesLayout', async () => {
    settings = useTerminalSettings({ layout: 'editor', workspaceLayout: 'fullscreen' });

    await writeTerminalLayout('panel');

    expect(settings.update).toHaveBeenCalledWith('terminal.layout', 'panel', vscode.ConfigurationTarget.Workspace);
    expect(readTerminalLayout()).toBe('panel');
  });
});

describe('layout switching', () => {
  it('switchTo_shouldMoveOurTerminalToPanel_whenEditorToPanel', async () => {
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.panel);

    expect(settings.values.layout).toBe('panel');
    expect(terminal.show).toHaveBeenCalledWith(false);
    expect(terminal.show.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(vscode.commands.executeCommand).mock.invocationCallOrder[0]);
    expect(executedCommands()).toEqual([MOVE_TO_PANEL]);
  });

  it('switchTo_shouldMoveToEditorThenMaximize_whenPanelToFullscreen', async () => {
    settings = useTerminalSettings({ layout: 'panel' });
    terminalInPanel();
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(settings.values.layout).toBe('fullscreen');
    expect(executedCommands()).toEqual([MOVE_TO_EDITOR, TOGGLE_MAXIMIZE]);
  });

  it('switchTo_shouldOnlyUnmaximize_whenFullscreenToEditor', async () => {
    register();
    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await run(TERMINAL_LAYOUT_COMMANDS.editor);

    expect(settings.values.layout).toBe('editor');
    expect(executedCommands()).toEqual([TOGGLE_MAXIMIZE]);
  });

  it('switchTo_shouldUnmaximizeBeforeMoving_whenFullscreenToPanel', async () => {
    register();
    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await run(TERMINAL_LAYOUT_COMMANDS.panel);

    expect(executedCommands()).toEqual([TOGGLE_MAXIMIZE, MOVE_TO_PANEL]);
  });

  it('switchTo_shouldNotUnmaximize_whenGroupWasNotMaximizedByUs', async () => {
    settings = useTerminalSettings({ layout: 'fullscreen' });
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.editor);

    expect(executedCommands()).toEqual([]);
  });

  it('switchTo_shouldSkipMaximize_whenOnlyOneEditorGroupExists', async () => {
    vscode.window.tabGroups.all = [{ tabs: [{ label: terminal.name, input: new vscode.TabInputTerminal() }] }];
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(executedCommands()).toEqual([]);
  });

  it('switchTo_shouldOnlyRememberLayout_whenTerminalIsNotOpen', async () => {
    terminalFor.mockReturnValue(undefined);
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.fullscreen);

    expect(settings.values.layout).toBe('fullscreen');
    expect(terminal.show).not.toHaveBeenCalled();
    expect(executedCommands()).toEqual([]);
  });

  it('toggleFullScreen_shouldReturnToPreviousLayout_whenToggledTwice', async () => {
    settings = useTerminalSettings({ layout: 'panel' });
    terminalInPanel();
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.toggleFullScreen);
    expect(settings.values.layout).toBe('fullscreen');
    terminalInEditor();
    vi.mocked(vscode.commands.executeCommand).mockClear();

    await run(TERMINAL_LAYOUT_COMMANDS.toggleFullScreen);

    expect(settings.values.layout).toBe('panel');
    expect(executedCommands()).toEqual([TOGGLE_MAXIMIZE, MOVE_TO_PANEL]);
  });

  it('pick_shouldMarkCurrentLayoutAndApplySelection', async () => {
    vi.mocked(vscode.window.showQuickPick).mockImplementation((async (items: { label: string; layout: string }[]) => {
      expect(items.map((item) => item.label)).toEqual(['Panel', '$(check) Editor', 'Full screen']);
      return items[0];
    }) as never);
    register();

    await run(TERMINAL_LAYOUT_COMMANDS.pick);

    expect(settings.values.layout).toBe('panel');
    expect(executedCommands()).toEqual([MOVE_TO_PANEL]);
  });
});

describe('layout status bar item', () => {
  it('statusItem_shouldShowCurrentLayout_whenWorkspaceIsActive', () => {
    const before = vscode.statusBarItems.length;
    settings = useTerminalSettings({ maximize: true });

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
