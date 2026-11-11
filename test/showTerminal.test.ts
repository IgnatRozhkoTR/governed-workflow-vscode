import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerClaudeTerminal } from '../src/terminal/claudeTerminal';
import type { WorkspaceRef } from '../src/api/types';

const REF = { projectId: 1, branch: 'feature/x' } as WorkspaceRef;
const SHOW_COMMAND = 'governedWorkflow.showTerminal';
const RESUME_COMMAND = 'governedWorkflow.resumeClaude';
const MAXIMIZE_COMMAND = 'workbench.action.maximizeEditorHideSidebar';

const client = { terminalResume: vi.fn(), terminalSocketUrl: vi.fn() };
const fakeTerminal = { show: vi.fn(), dispose: vi.fn(), sendText: vi.fn() };
let activeWorkspace: { workspace: WorkspaceRef | undefined };
let handlers: Map<string, (...args: unknown[]) => Promise<void>>;

function register(): void {
  registerClaudeTerminal({ subscriptions: [] } as never, { client: client as never, activeWorkspace });
}

function run(command: string): Promise<void> {
  const handler = handlers.get(command);
  if (handler === undefined) {
    throw new Error(`command not registered: ${command}`);
  }
  return handler();
}

beforeEach(() => {
  vi.clearAllMocks();
  activeWorkspace = { workspace: REF };
  handlers = new Map();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: never) => {
    handlers.set(id, handler);
    return { dispose: vi.fn() };
  }) as never);
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => true } as never);
  vi.mocked(vscode.window.createTerminal).mockReturnValue(fakeTerminal as never);
  client.terminalResume.mockResolvedValue(undefined);
  client.terminalSocketUrl.mockResolvedValue('ws://panel/terminal');
  register();
});

describe('governedWorkflow.showTerminal', () => {
  it('showTerminal_shouldAttachAndShow_whenTerminalWasNeverOpened', async () => {
    await run(SHOW_COMMAND);

    expect(client.terminalResume).toHaveBeenCalledWith(REF);
    expect(vscode.window.createTerminal).toHaveBeenCalledTimes(1);
    expect(fakeTerminal.show).toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(MAXIMIZE_COMMAND);
  });

  it('showTerminal_shouldRevealWithFocusWithoutReattaching_whenTerminalExists', async () => {
    await run(RESUME_COMMAND);
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => true } as never);

    await run(SHOW_COMMAND);

    expect(fakeTerminal.show).toHaveBeenCalledWith(false);
    expect(client.terminalResume).not.toHaveBeenCalled();
    expect(vscode.window.createTerminal).not.toHaveBeenCalled();
    expect(vscode.commands.executeCommand).toHaveBeenCalledWith(MAXIMIZE_COMMAND);
  });

  it('showTerminal_shouldSkipMaximize_whenSettingIsOff', async () => {
    await run(RESUME_COMMAND);
    vi.clearAllMocks();
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ get: () => false } as never);

    await run(SHOW_COMMAND);

    expect(fakeTerminal.show).toHaveBeenCalledWith(false);
    expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
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
