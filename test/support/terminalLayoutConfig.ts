import { vi } from 'vitest';
import * as vscode from 'vscode';

export interface TerminalSettingValues {
  layout?: unknown;
  workspaceLayout?: unknown;
  maximize?: unknown;
}

export interface FakeTerminalConfiguration {
  readonly values: TerminalSettingValues;
  readonly update: ReturnType<typeof vi.fn>;
}

export function useTerminalSettings(values: TerminalSettingValues): FakeTerminalConfiguration {
  const update = vi.fn(async (key: string, value: unknown, target: number) => {
    if (key !== 'terminal.layout') {
      return;
    }
    if (target === vscode.ConfigurationTarget.Workspace) {
      values.workspaceLayout = value;
    } else {
      values.layout = value;
    }
  });
  const inspect = (key: string) => {
    if (key === 'terminal.layout') {
      return { key, globalValue: values.layout, workspaceValue: values.workspaceLayout };
    }
    return key === 'terminal.maximize' ? { key, globalValue: values.maximize } : undefined;
  };
  vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({ inspect, update } as never);
  return { values, update };
}
