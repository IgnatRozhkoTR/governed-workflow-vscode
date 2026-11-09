import type { JSX } from 'preact';
import { useBusyHandler } from './Button';
import { Icon } from './Icon';
import { classNames, toneClass, type Codicon, type Tone } from './types';

export interface IconButtonProps {
  readonly icon: Codicon;
  readonly title: string;
  readonly onClick: (e: MouseEvent) => void | Promise<void>;
  readonly disabled?: boolean;
  readonly tone?: Tone;
}

export function IconButton({ icon, title, onClick, disabled = false, tone }: IconButtonProps): JSX.Element {
  const [isBusy, handleClick] = useBusyHandler(onClick);
  return (
    <button
      type="button"
      class={classNames('gw-icon-button', tone !== undefined && toneClass(tone))}
      title={title}
      aria-label={title}
      disabled={disabled || isBusy}
      onClick={handleClick}
    >
      <Icon name={isBusy ? 'loading' : icon} spin={isBusy} />
    </button>
  );
}
