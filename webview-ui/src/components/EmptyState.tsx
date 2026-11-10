import type { ComponentChildren, JSX } from 'preact';
import { Button } from './Button';
import { Icon } from './Icon';
import type { Codicon } from './types';

export interface EmptyStateAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface EmptyStateProps {
  readonly icon?: Codicon;
  readonly message: string;
  readonly action?: EmptyStateAction | ComponentChildren;
}

function isEmptyStateAction(action: EmptyStateAction | ComponentChildren): action is EmptyStateAction {
  return typeof action === 'object' && action !== null && !Array.isArray(action) && !('type' in action) && 'label' in action && 'onClick' in action;
}

export function EmptyState({ icon, message, action }: EmptyStateProps): JSX.Element {
  return (
    <div class="gw-empty-state">
      {icon !== undefined && <Icon name={icon} className="gw-empty-state-icon" />}
      <p>{message}</p>
      {isEmptyStateAction(action) ? <Button label={action.label} onClick={action.onClick} /> : action}
    </div>
  );
}
