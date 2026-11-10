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
  // Set for a button that opens a menu, so assistive technology announces the menu and whether it is open.
  readonly menuExpanded?: boolean;
}

export function IconButton({ icon, title, onClick, disabled = false, tone, menuExpanded }: IconButtonProps): JSX.Element {
  const [isBusy, handleClick] = useBusyHandler(onClick);
  return (
    <button
      type="button"
      class={classNames('gw-icon-button', tone !== undefined && toneClass(tone))}
      title={title}
      aria-label={title}
      aria-haspopup={menuExpanded === undefined ? undefined : 'menu'}
      aria-expanded={menuExpanded}
      disabled={disabled || isBusy}
      onClick={handleClick}
    >
      <Icon name={isBusy ? 'loading' : icon} spin={isBusy} />
    </button>
  );
}
