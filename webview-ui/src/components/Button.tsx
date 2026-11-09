import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { Icon } from './Icon';
import { classNames, type Codicon } from './types';

export interface ButtonProps {
  readonly variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  readonly icon?: Codicon;
  readonly label?: string;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly size?: 'sm' | 'md';
  readonly onClick: (e: MouseEvent) => void | Promise<void>;
}

export function useBusyHandler<A extends unknown[]>(handler: (...args: A) => void | Promise<void>): [boolean, (...args: A) => void] {
  const [isBusy, setBusy] = useState(false);
  const run = (...args: A): void => {
    const result = handler(...args);
    if (result instanceof Promise) {
      setBusy(true);
      void result.finally(() => setBusy(false));
    }
  };
  return [isBusy, run];
}

export function Button(props: ButtonProps): JSX.Element {
  const { variant = 'secondary', icon, label, title, disabled = false, busy = false, size = 'md' } = props;
  const [isRunning, handleClick] = useBusyHandler(props.onClick);
  const isBusy = busy || isRunning;
  return (
    <button
      type="button"
      class={classNames('gw-button', `gw-button-${variant}`, `gw-button-${size}`, label === undefined && 'gw-button-icon-only')}
      title={title ?? label}
      disabled={disabled || isBusy}
      aria-busy={isBusy}
      onClick={handleClick}
    >
      {isBusy ? <Icon name="loading" spin /> : icon !== undefined && <Icon name={icon} />}
      {label !== undefined && <span>{label}</span>}
    </button>
  );
}
