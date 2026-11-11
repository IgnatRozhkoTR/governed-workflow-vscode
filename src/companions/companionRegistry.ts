export type CompanionHost = 'ui' | 'workspace';

export type CompanionTrigger = 'environment' | 'command' | 'openWorktree';

export type CompanionPresence = 'installed' | 'missing' | 'unknown';

export interface CompanionEnvironment {
  readonly serverUrl: string;
  readonly remoteName: string | undefined;
}

export interface Companion {
  readonly id: string;
  readonly displayName: string;
  readonly reason: string;
  readonly neededOn: CompanionHost;
  readonly impliedByRemoteName?: string;
  readonly isNeeded: (environment: CompanionEnvironment) => boolean;
}

const LOCAL_HOSTNAMES: readonly string[] = ['localhost', '127.0.0.1', '::1', '[::1]'];

export const REMOTE_SSH_CONNECT_COMMAND = 'opensshremotes.openEmptyWindow';

export const REMOTE_SSH: Companion = {
  id: 'ms-vscode-remote.remote-ssh',
  displayName: 'Remote - SSH',
  reason: 'Needed only when VS Code runs on a different machine from the code and the admin panel.',
  neededOn: 'ui',
  impliedByRemoteName: 'ssh-remote',
  isNeeded: (environment) => isRemoteServerUrl(environment.serverUrl),
};

export const COMPANIONS: readonly Companion[] = [REMOTE_SSH];

export function isRemoteServerUrl(serverUrl: string): boolean {
  return remoteServerHostname(serverUrl) !== undefined;
}

export function remoteServerHostname(serverUrl: string): string | undefined {
  const hostname = parseHostname(serverUrl);
  return hostname === undefined || hostname === '' || LOCAL_HOSTNAMES.includes(hostname.toLowerCase()) ? undefined : hostname;
}

// An extension host only sees extensions installed in that same host, so a UI-side companion is invisible from a remote window.
export function companionPresence(
  companion: Companion,
  environment: CompanionEnvironment,
  isInstalledInThisHost: (id: string) => boolean,
): CompanionPresence {
  const isImpliedByRemote = companion.impliedByRemoteName !== undefined && environment.remoteName === companion.impliedByRemoteName;
  if (isImpliedByRemote || isInstalledInThisHost(companion.id)) {
    return 'installed';
  }
  return companion.neededOn === 'ui' && environment.remoteName !== undefined ? 'unknown' : 'missing';
}

function parseHostname(serverUrl: string): string | undefined {
  try {
    return new URL(serverUrl).hostname;
  } catch (error) {
    if (error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
}
