import type { JSX } from 'preact';
import { classNames, type Codicon } from './types';

export interface IconProps {
  readonly name: Codicon;
  readonly spin?: boolean;
  readonly className?: string;
}

export function Icon({ name, spin = false, className }: IconProps): JSX.Element {
  return <i class={classNames('codicon', `codicon-${name}`, spin && 'codicon-modifier-spin', className)} aria-hidden="true" />;
}
