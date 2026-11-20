import { vi } from 'vitest';
import * as vscode from 'vscode';
import type { FakeTab, FakeTabGroup } from '../vscodeStub';

export const COMMANDS = {
  moveToPanel: 'workbench.action.terminal.moveToTerminalPanel',
  moveToEditor: 'workbench.action.terminal.moveToEditor',
  maximizeHideSideBars: 'workbench.action.maximizeEditorHideSidebar',
  toggleMaximizeGroup: 'workbench.action.toggleMaximizeEditorGroup',
  showSideBar: 'workbench.action.focusSideBar',
  showPreviousEditor: 'workbench.action.openPreviousRecentlyUsedEditorInGroup',
  focusActiveGroup: 'workbench.action.focusActiveEditorGroup',
  toggleTerminalView: 'workbench.action.terminal.toggleTerminal',
  focusSecondGroup: 'workbench.action.focusSecondEditorGroup',
} as const;

export function terminalTab(name: string): FakeTab {
  return { label: name, input: new vscode.TabInputTerminal() };
}

// Groups are listed left to right; the first one marked active becomes the active tab group.
export function useTabGroups(...groups: { tabs: FakeTab[]; isActive?: boolean }[]): FakeTabGroup[] {
  const placed = groups.map((group, index) => ({ tabs: group.tabs, isActive: group.isActive === true, viewColumn: index + 1 }));
  vscode.window.tabGroups.all = placed;
  vscode.window.tabGroups.activeTabGroup = placed.find((group) => group.isActive);
  return placed;
}

export function executedCommands(): unknown[] {
  return vi.mocked(vscode.commands.executeCommand).mock.calls.map(([command]) => command);
}
