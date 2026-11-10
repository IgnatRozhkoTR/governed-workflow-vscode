import type { ComponentChildren, JSX } from 'preact';
import { useId } from 'preact/hooks';
import { Icon } from './Icon';
import { classNames } from './types';
import { useAnchorTarget, useRevealOnAnchor } from './useAnchor';
import { useOpenState } from './useOpenState';

export interface CardProps {
  readonly id?: string;
  readonly title: ComponentChildren;
  readonly subtitle?: ComponentChildren;
  readonly collapsedPreview?: ComponentChildren;
  readonly actions?: ComponentChildren;
  readonly badge?: ComponentChildren;
  readonly collapsible?: boolean;
  readonly framed?: boolean;
  readonly defaultCollapsed?: boolean;
  readonly persistKey?: string;
  readonly revealOnAnchor?: string;
  readonly children?: ComponentChildren;
}

export function Card(props: CardProps): JSX.Element {
  const { id, title, subtitle, collapsedPreview, actions, badge, collapsible = true, framed = false, defaultCollapsed = false, persistKey, revealOnAnchor, children } = props;
  const titleId = useId();
  const [isOpen, toggle, setOpen] = useOpenState(!defaultCollapsed, persistKey ?? (id === undefined ? undefined : `card.${id}`));
  const [ref, isHighlighted] = useAnchorTarget<HTMLElement>(id, () => setOpen(true));
  useRevealOnAnchor(revealOnAnchor, () => setOpen(true));
  const isBodyVisible = !collapsible || isOpen;
  return (
    <section id={id} ref={ref} class={classNames('gw-card', framed && 'gw-card-framed', isHighlighted && 'gw-card-highlight')}>
      <header class={classNames('gw-card-header', collapsible && 'gw-card-header-collapsible')} onClick={collapsible ? toggle : undefined}>
        {collapsible && (
          <button type="button" class="gw-card-toggle" aria-expanded={isOpen} aria-label={typeof title === 'string' ? title : undefined} aria-labelledby={typeof title === 'string' ? undefined : titleId}>
            <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
          </button>
        )}
        <div class="gw-card-titles">
          <div class="gw-card-title"><span id={titleId} class="gw-card-title-text">{title}</span>{badge}</div>
          {subtitle !== undefined && <div class="gw-card-subtitle">{subtitle}</div>}
          {!isBodyVisible && collapsedPreview !== undefined && <div class="gw-card-preview">{collapsedPreview}</div>}
        </div>
        {actions !== undefined && <div class="gw-card-actions" onClick={(event) => event.stopPropagation()}>{actions}</div>}
      </header>
      {isBodyVisible && <div class="gw-card-body">{children}</div>}
    </section>
  );
}
