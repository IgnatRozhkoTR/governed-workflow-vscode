import type { JSX } from 'preact';
import { classNames, toneClass, type Tone } from './types';

export interface StatusDotProps {
  readonly status: string;
  readonly title?: string;
}

const STATUS_TONES: Readonly<Record<string, Tone>> = {
  pending: 'neutral',
  in_progress: 'info',
  done: 'success',
  completed: 'success',
  failed: 'danger',
  skipped: 'warning',
  blocked: 'danger',
};

export function StatusDot({ status, title }: StatusDotProps): JSX.Element {
  return <span class={classNames('gw-status-dot', toneClass(STATUS_TONES[status]))} title={title ?? status} role="img" aria-label={title ?? status} />;
}
