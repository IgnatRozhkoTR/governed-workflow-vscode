import type { ComponentChildren, JSX } from 'preact';
import { Icon } from './Icon';
import { classNames } from './types';
import { useAnchorTarget } from './useAnchor';
import { useOpenState } from './useOpenState';

export interface CardProps {
  readonly id?: string;
  readonly title: ComponentChildren;
  readonly subtitle?: ComponentChildren;
  readonly actions?: ComponentChildren;
  readonly badge?: ComponentChildren;
  readonly collapsible?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly persistKey?: string;
  readonly children?: ComponentChildren;
}

export function Card(props: CardProps): JSX.Element {
  const { id, title, subtitle, actions, badge, collapsible = false, defaultCollapsed = false, persistKey, children } = props;
  const [ref, isHighlighted] = useAnchorTarget<HTMLElement>(id);
  const [isOpen, toggle] = useOpenState(!defaultCollapsed, persistKey);
  const isBodyVisible = !collapsible || isOpen;
  return (
    <section id={id} ref={ref} class={classNames('gw-card', isHighlighted && 'gw-card-highlight')}>
      <header class="gw-card-header">
        {collapsible && (
          <button type="button" class="gw-card-toggle" aria-expanded={isOpen} onClick={toggle}>
            <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
          </button>
        )}
        <div class="gw-card-titles">
          <div class="gw-card-title">{title}{badge}</div>
          {subtitle !== undefined && <div class="gw-card-subtitle">{subtitle}</div>}
        </div>
        {actions !== undefined && <div class="gw-card-actions">{actions}</div>}
      </header>
      {isBodyVisible && <div class="gw-card-body">{children}</div>}
    </section>
  );
}
