import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { CLAUDE_TERMINAL_ACTIVE_CONTEXT_KEY, registerClaudeTerminal, type ClaudeTerminalHandle } from '../src/terminal/claudeTerminal';
import { TerminalPlacement } from '../src/terminal/terminalLayout';
import { useTerminalSettings } from './support/terminalLayoutConfig';
import { COMMANDS, executedCommands, terminalTab, useTabGroups } from './support/terminalTabs';
import type { WorkspaceRef } from '../src/api/types';

const REF = { projectId: 1, branch: 'feature/x' } as WorkspaceRef;
const SHOW_COMMAND = 'governedWorkflow.showTerminal';
const TOGGLE_COMMAND = 'governedWorkflow.toggleTerminal';
const RESUME_COMMAND = 'governedWorkflow.resumeClaude';
const FOCUSED = { isFocused: true };

const client = { terminalResume: vi.fn(), terminalSocketUrl: vi.fn() };
const fakeTerminal = { name: 'Claude: feature/x', show: vi.fn(), dispose: vi.fn(), sendText: vi.fn() };
let activeWorkspace: { workspace: WorkspaceRef | undefined };
let handlers: Map<string, (...args: unknown[]) => Promise<void>>;
let placement: TerminalPlacement;
let handle: ClaudeTerminalHandle;
let activeTerminalChanged: () => void;

function register(): void {
  placement = new TerminalPlacement();
  handle = registerClaudeTerminal({ subscriptions: [] } as never, { client: client as never, activeWorkspace, placement });
}

function run(command: string, ...args: unknown[]): Promise<void> {
  const handler = handlers.get(command);
  if (handler === undefined) {
    throw new Error(`command not registered: ${command}`);
  }
  return handler(...args);
}

function terminalInEditor(): void {
  useTabGroups({ tabs: [terminalTab(fakeTerminal.name)], isActive: true }, { tabs: [] });
}

async function openTerminalThenClearCalls(): Promise<void> {
  await run(RESUME_COMMAND);
  terminalInEditor();
  vi.mocked(vscode.commands.executeCommand).mockClear();
  fakeTerminal.show.mockClear();
}

function contextKeyValues(): unknown[] {
  return vi.mocked(vscode.commands.executeCommand).mock.calls
    .filter(([command, key]) => command === 'setContext' && key === CLAUDE_TERMINAL_ACTIVE_CONTEXT_KEY)
    .map(([, , value]) => value);
}

beforeEach(() => {
  vi.clearAllMocks();
  activeWorkspace = { workspace: REF };
  handlers = new Map();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: never) => {
    handlers.set(id, handler);
    return { dispose: vi.fn() };
  }) as never);
  vi.mocked(vscode.window.onDidChangeActiveTerminal).mockImplementation(((listener: () => void) => {
    activeTerminalChanged = listener;
    return { dispose: vi.fn() };
  }) as never);
  vscode.window.activeTerminal = undefined;
  useTerminalSettings({ layout: 'fullscreen' });
  useTabGroups({ tabs: [], isActive: true }, { tabs: [] });
  vi.mocked(vscode.window.createTerminal).mockReturnValue(fakeTerminal as never);
  client.terminalResume.mockResolvedValue(undefined);
  client.terminalSocketUrl.mockResolvedValue('ws://panel/terminal');
  register();
});

afterEach(() => {
  placement.dispose();
});

describe('governedWorkflow.showTerminal', () => {
  it('showTerminal_shouldAttachAndGoFullScreen_whenTerminalWasNeverOpened', async () => {
    await run(SHOW_COMMAND);

    expect(client.terminalResume).toHaveBeenCalledWith(REF);
    expect(vscode.window.createTerminal).toHaveBeenCalledWith(expect.objectContaining({ location: { viewColumn: vscode.ViewColumn.Active } }));
    expect(fakeTerminal.show).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(COMMANDS.maximizeHideSideBars);
  });

  it('showTerminal_shouldCreateInPanelWithoutMoving_whenLayoutIsPanel', async () => {
    useTerminalSettings({ layout: 'panel' });

    await run(SHOW_COMMAND);

    expect(vscode.window.createTerminal).toHaveBeenCalledWith(expect.objectContaining({ location: vscode.TerminalLocation.Panel }));
    expect(fakeTerminal.show).toHaveBeenCalledWith(false);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });

  it('showTerminal_shouldMoveExistingEditorTerminalToPanel_whenLayoutChangedToPanel', async () => {
    await openTerminalThenClearCalls();
    useTerminalSettings({ layout: 'panel' });

    await run(SHOW_COMMAND);

    expect(executedCommands()).toEqual([COMMANDS.toggleMaximizeGroup, COMMANDS.showSideBar, COMMANDS.moveToPanel]);
    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
  });

  it('showTerminal_shouldRevealWithFocusWithoutReattaching_whenTerminalExists', async () => {
    await openTerminalThenClearCalls();
    client.terminalResume.mockClear();

    await run(SHOW_COMMAND);

    expect(fakeTerminal.show).toHaveBeenCalledWith(false);
    expect(client.terminalResume).not.toHaveBeenCalled();
    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    expect(executedCommands()).toEqual([COMMANDS.maximizeHideSideBars]);
  });

  it('showTerminal_shouldShowRatherThanHide_whenCalledWithFocusedArgument', async () => {
    await openTerminalThenClearCalls();
    vscode.window.activeTerminal = fakeTerminal;

    await run(SHOW_COMMAND, FOCUSED);

    expect(executedCommands()).not.toContain(COMMANDS.showPreviousEditor);
    expect(fakeTerminal.show).toHaveBeenCalledWith(false);
  });

  it('showTerminal_shouldOfferWorkspacePicker_whenNoActiveWorkspace', async () => {
    activeWorkspace.workspace = undefined;
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue('Switch Workspace…' as never);

    await run(SHOW_COMMAND);

    expect(client.terminalResume).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith('governedWorkflow.switchWorkspace');
  });

  it('showTerminal_shouldDoNothingMore_whenPickerDismissed', async () => {
    activeWorkspace.workspace = undefined;
    vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined as never);

    await run(SHOW_COMMAND);

    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
  });
});

describe('governedWorkflow.toggleTerminal', () => {
  it('toggleTerminal_shouldHideBehindPreviousEditor_whenFocusedInFullScreen', async () => {
    await openTerminalThenClearCalls();
    await run(SHOW_COMMAND);
    vi.mocked(vscode.commands.executeCommand).mockClear();
    vscode.window.activeTerminal = fakeTerminal;

    await run(TOGGLE_COMMAND, FOCUSED);

    expect(executedCommands()).toEqual([
      COMMANDS.showPreviousEditor,
      COMMANDS.toggleMaximizeGroup,
      COMMANDS.showSideBar,
      COMMANDS.focusActiveGroup,
    ]);
  });

  it('toggleTerminal_shouldHideTerminalView_whenFocusedInPanel', async () => {
    useTerminalSettings({ layout: 'panel' });
    await run(RESUME_COMMAND);
    vi.mocked(vscode.commands.executeCommand).mockClear();
    vscode.window.activeTerminal = fakeTerminal;

    await run(TOGGLE_COMMAND, FOCUSED);

    expect(executedCommands()).toEqual([COMMANDS.toggleTerminalView]);
  });

  it('toggleTerminal_shouldShow_whenCalledWithoutFocusArgument', async () => {
    await openTerminalThenClearCalls();
    vscode.window.activeTerminal = fakeTerminal;

    await run(TOGGLE_COMMAND);

    expect(fakeTerminal.show).toHaveBeenCalledWith(false);
    expect(executedCommands()).toEqual([COMMANDS.maximizeHideSideBars]);
  });

  it('toggleTerminal_shouldShow_whenFocusedTerminalIsNotClaude', async () => {
    await openTerminalThenClearCalls();
    vscode.window.activeTerminal = { name: 'zsh' };

    await run(TOGGLE_COMMAND, FOCUSED);

    expect(executedCommands()).toEqual([COMMANDS.maximizeHideSideBars]);
  });

  it('toggleTerminal_shouldCreateTerminal_whenNoneIsOpen', async () => {
    await run(TOGGLE_COMMAND);

    expect(client.terminalResume).toHaveBeenCalledWith(REF);
    expect(vscode.window.createTerminal).toHaveBeenCalled();
  });
});

describe('Claude terminal context key', () => {
  it('activeTerminalChange_shouldSetContextTrue_whenClaudeTerminalBecomesActive', async () => {
    await run(RESUME_COMMAND);
    vscode.window.activeTerminal = fakeTerminal;

    activeTerminalChanged();

    expect(contextKeyValues()).toEqual([true]);
    expect(handle.activeSession()).toEqual({ ref: REF, terminal: fakeTerminal });
  });

  it('activeTerminalChange_shouldSetContextFalse_whenOtherTerminalBecomesActive', async () => {
    await run(RESUME_COMMAND);
    vscode.window.activeTerminal = { name: 'zsh' };

    activeTerminalChanged();

    expect(contextKeyValues()).toEqual([false]);
    expect(handle.activeSession()).toBeUndefined();
  });
});
