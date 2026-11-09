import type { ComponentChildren, JSX } from 'preact';
import { Icon } from './Icon';
import type { Codicon } from './types';

export interface EmptyStateProps {
  readonly icon?: Codicon;
  readonly message: string;
  readonly action?: ComponentChildren;
}

export function EmptyState({ icon, message, action }: EmptyStateProps): JSX.Element {
  return (
    <div class="gw-empty-state">
      {icon !== undefined && <Icon name={icon} className="gw-empty-state-icon" />}
      <p>{message}</p>
      {action}
    </div>
  );
}
