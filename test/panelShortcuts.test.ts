import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerPanelCommands } from '../src/webview/panelCommands';

const panel = { createOrShow: vi.fn() };
let handlers: Map<string, (arg?: unknown) => Promise<void>>;

beforeEach(() => {
  vi.clearAllMocks();
  handlers = new Map();
  vi.mocked(vscode.commands.registerCommand).mockImplementation(((id: string, handler: never) => {
    handlers.set(id, handler);
    return { dispose: vi.fn() };
  }) as never);
  registerPanelCommands({ subscriptions: [] } as never, { client: {} as never, active: {} as never, panel: panel as never });
});

describe('Workspace Control tab shortcuts', () => {
  it.each([
    ['governedWorkflow.openChangesTab', 'changes'],
    ['governedWorkflow.openScratchpads', 'scratchpads'],
  ])('%s_shouldOpenControlPanelOnItsTab', async (command, tab) => {
    await handlers.get(command)?.();

    expect(panel.createOrShow).toHaveBeenCalledWith({ tab });
  });
});
