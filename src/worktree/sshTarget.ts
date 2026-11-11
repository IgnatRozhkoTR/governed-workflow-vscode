import * as vscode from 'vscode';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { OnSelectWorkspace } from './onSelectWorkspace';

const REMOTE_SCHEME = 'vscode-remote';
const SSH_AUTHORITY_PREFIX = 'ssh-remote+';

export type ServerInfoSource = Pick<ApiClient, 'getServerInfo'>;

// The serverUrl host is used rather than the hostname the panel reports, because the URL host is the name already proven to resolve from here.
export async function resolveSshTarget(configuredHost: string | undefined, serverHostname: string, source: ServerInfoSource): Promise<string> {
  if (configuredHost !== undefined) {
    return configuredHost;
  }
  const user = await serverUser(source);
  return user === undefined ? serverHostname : `${user}@${serverHostname}`;
}

export function sshFolderUri(sshTarget: string, worktreePath: string): vscode.Uri {
  return vscode.Uri.from({ scheme: REMOTE_SCHEME, authority: `${SSH_AUTHORITY_PREFIX}${sshTarget}`, path: worktreePath });
}

// A remote folder cannot join a local window, so addFolder opens a new window like the default.
export function opensSshInNewWindow(behaviour: Exclude<OnSelectWorkspace, 'off'>): boolean {
  return behaviour !== 'sameWindow';
}

// An admin panel older than /api/server-info answers 404; ssh then picks the user from ~/.ssh/config or the local login.
async function serverUser(source: ServerInfoSource): Promise<string | undefined> {
  try {
    const info = await source.getServerInfo();
    return typeof info.user === 'string' && info.user.trim() !== '' ? info.user.trim() : undefined;
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) {
      return undefined;
    }
    throw error;
  }
}
