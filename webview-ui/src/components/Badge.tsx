import type { JSX } from 'preact';
import { Icon } from './Icon';
import { classNames, toneClass, type Codicon, type Tone } from './types';

export interface BadgeProps {
  readonly label: string;
  readonly tone?: Tone;
  readonly title?: string;
  readonly icon?: Codicon;
}

export function Badge({ label, tone, title, icon }: BadgeProps): JSX.Element {
  return (
    <span class={classNames('gw-badge', toneClass(tone))} title={title}>
      {icon !== undefined && <Icon name={icon} />}
      {label}
    </span>
  );
}
