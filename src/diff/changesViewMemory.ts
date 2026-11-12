import type * as vscode from 'vscode';
import type { ChangesLayout, WorkingTreeMode } from './changesModel';

const MODE_KEY = 'governedWorkflow.changes.mode';
const LAYOUT_KEY = 'governedWorkflow.changes.layout';

export class ChangesViewMemory {
  constructor(private readonly storage: vscode.Memento) {}

  get mode(): WorkingTreeMode {
    return this.storage.get<string>(MODE_KEY) === 'uncommitted' ? 'uncommitted' : 'branch';
  }

  get layout(): ChangesLayout {
    return this.storage.get<string>(LAYOUT_KEY) === 'list' ? 'list' : 'tree';
  }

  async setMode(mode: WorkingTreeMode): Promise<void> {
    await this.storage.update(MODE_KEY, mode);
  }

  async setLayout(layout: ChangesLayout): Promise<void> {
    await this.storage.update(LAYOUT_KEY, layout);
  }
}
