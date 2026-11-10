const KNOWN_RUN_STATUSES: readonly string[] = ['passed', 'failed', 'pending', 'skipped', 'running', 'error', 'cancelled', 'timeout', 'warning'];

export function runStatusLabel(translate: (key: string) => string, status: string): string {
  return KNOWN_RUN_STATUSES.includes(status) ? translate(`vsc.runStatus.${status}`) : status;
}
