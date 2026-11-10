import type { ComponentChildren, JSX } from 'preact';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';

export interface EmptySectionLineProps {
  readonly id: string;
  readonly text: string;
  readonly action: ComponentChildren;
}

// A section with nothing to show yet takes one muted line instead of a card, and stays a jump target under its card's id.
export function EmptySectionLine({ id, text, action }: EmptySectionLineProps): JSX.Element {
  const [ref, isHighlighted] = useAnchorTarget<HTMLDivElement>(id);
  return (
    <div id={id} ref={ref} class={classNames('gw-phase-empty-line', isHighlighted && 'gw-card-highlight')}>
      <span>{text}</span>
      {action}
    </div>
  );
}
