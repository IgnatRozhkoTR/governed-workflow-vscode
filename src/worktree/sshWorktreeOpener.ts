import * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';
import type { NavTarget } from '../shared/navigation';
import type { Settings } from '../config/settings';
import { offerCompanion } from '../companions/companionPrompt';
import type { CompanionPromptMemory } from '../companions/companionPromptMemory';
import { REMOTE_SSH, remoteServerHostname } from '../companions/companionRegistry';
import type { OnSelectWorkspace } from './onSelectWorkspace';
import { ensureInstalledOnSshHosts } from './sshHostExtension';
import { opensSshInNewWindow, resolveSshTarget, sshFolderUri, type ServerInfoSource } from './sshTarget';
import type { WorktreeHandoff } from './worktreeHandoff';

export type SshOpenOutcome = 'opened' | 'unavailable' | 'declined';

export interface SshWorktreeOpenerDeps {
  readonly client: ServerInfoSource;
  readonly settings: Settings;
  readonly handoff: WorktreeHandoff;
  readonly companionMemory: CompanionPromptMemory;
  readonly extensionId: string;
}

// Opens a worktree that lives on the admin panel's machine in a Remote-SSH window, from a window running on another machine.
export class SshWorktreeOpener {
  constructor(private readonly deps: SshWorktreeOpenerDeps) {}

  async open(ref: WorkspaceRef, worktreePath: string, behaviour: Exclude<OnSelectWorkspace, 'off'>, nav?: NavTarget): Promise<SshOpenOutcome> {
    const serverHostname = remoteServerHostname(this.deps.settings.serverUrl);
    if (vscode.env.remoteName !== undefined || serverHostname === undefined || worktreePath === '') {
      return 'unavailable';
    }
    if (!(await this.hasRemoteSsh(serverHostname))) {
      return 'declined';
    }
    const sshTarget = await resolveSshTarget(this.deps.settings.sshHost, serverHostname, this.deps.client);
    await ensureInstalledOnSshHosts(this.deps.extensionId);
    await this.deps.handoff.offer(worktreePath, ref, nav);
    await vscode.commands.executeCommand('vscode.openFolder', sshFolderUri(sshTarget, worktreePath), {
      forceNewWindow: opensSshInNewWindow(behaviour),
    });
    return 'opened';
  }

  private async hasRemoteSsh(serverHostname: string): Promise<boolean> {
    if (vscode.extensions.getExtension(REMOTE_SSH.id) !== undefined) {
      return true;
    }
    const reason = `It opens worktrees that live on ${serverHostname}, where the admin panel runs.`;
    return offerCompanion(REMOTE_SSH, 'openWorktree', this.deps.companionMemory, reason);
  }
}
