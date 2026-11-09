import type { ComponentChildren, JSX } from 'preact';
import { Icon } from './Icon';
import { useOpenState } from './useOpenState';

export interface CollapsibleProps {
  readonly summary: ComponentChildren;
  readonly defaultOpen?: boolean;
  readonly persistKey?: string;
  readonly children?: ComponentChildren;
}

export function Collapsible({ summary, defaultOpen = false, persistKey, children }: CollapsibleProps): JSX.Element {
  const [isOpen, toggle] = useOpenState(defaultOpen, persistKey);
  return (
    <div class="gw-collapsible">
      <button type="button" class="gw-collapsible-summary" aria-expanded={isOpen} onClick={toggle}>
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
        <span>{summary}</span>
      </button>
      {isOpen && <div class="gw-collapsible-body">{children}</div>}
    </div>
  );
}
