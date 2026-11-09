import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { formatDate, timeAgo } from '../lib/format';

export interface TimeAgoProps {
  readonly iso: string;
}

const REFRESH_INTERVAL_MS = 60_000;

export function TimeAgo({ iso }: TimeAgoProps): JSX.Element {
  useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  return <time class="gw-time-ago" dateTime={iso} title={formatDate(iso)}>{timeAgo(iso, now)}</time>;
}
