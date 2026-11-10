import { currentLocale } from '../i18n/i18n';
import { RpcError } from '../rpc/rpcClient';

const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];
const ELLIPSIS = '…';
const MAX_URL_LENGTH = 60;
const URL_SCHEME_PATTERN = /^https?:\/\//;

// The backend stores naive local timestamps (datetime.now().isoformat()); parse them as local time like the web does.
export function parseServerDate(iso: string): Date {
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const date = parseServerDate(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  // Clock skew between the server and the webview, plus the coarse refresh tick, can put fresh items slightly in the future.
  const seconds = Math.min(0, Math.round((date.getTime() - now.getTime()) / 1000));
  const format = new Intl.RelativeTimeFormat(currentLocale(), { numeric: 'auto' });
  const unit = RELATIVE_UNITS.find(([, size]) => Math.abs(seconds) >= size);
  return unit === undefined ? format.format(0, 'second') : format.format(Math.round(seconds / unit[1]), unit[0]);
}

export function formatDate(iso: string): string {
  const date = parseServerDate(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// Server status words ("verified", "⚠ outdated") are lowercase for use mid-sentence; standing alone as a badge or
// an option they start with a capital, like every other label.
export function capitalizeFirstLetter(text: string): string {
  return text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase(currentLocale()));
}

export function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1))}${ELLIPSIS}`;
}

export function shortenUrl(url: string): string {
  const stripped = url.replace(URL_SCHEME_PATTERN, '');
  return stripped.length > MAX_URL_LENGTH ? `${stripped.slice(0, MAX_URL_LENGTH - 3)}${ELLIPSIS}` : stripped;
}

export function describeError(error: unknown): string {
  if (error instanceof RpcError) {
    return error.message === '' ? error.code : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
