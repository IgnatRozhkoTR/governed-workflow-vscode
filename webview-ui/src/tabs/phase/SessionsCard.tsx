import type { SessionRecord } from '@api-types';
import type { JSX } from 'preact';
import { Badge, Card, TimeAgo } from '../../components';
import { useT } from '../../i18n/i18n';

export function SessionsCard({ sessions, activeSessionId }: { readonly sessions: readonly SessionRecord[]; readonly activeSessionId: string | null }): JSX.Element | null {
  const t = useT();
  if (sessions.length === 0) {
    return null;
  }
  return (
    <Card id="phase-sessions" title={t('workspace.sessions', { count: sessions.length })} defaultCollapsed persistKey="phase.sessions">
      <ul class="gw-phase-sessions">
        {[...sessions].reverse().map((session) => (
          <li key={session.session_id} class="gw-phase-session">
            <code>{session.session_id}</code>
            <TimeAgo iso={session.started_at} />
            {session.session_id === activeSessionId && <Badge label={t('badges.sessionActive')} tone="success" />}
          </li>
        ))}
      </ul>
    </Card>
  );
}
