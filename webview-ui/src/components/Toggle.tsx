import type { JSX } from 'preact';
import { useBusyHandler } from './Button';
import { classNames } from './types';

export interface ToggleProps {
  readonly checked: boolean;
  readonly onChange: (v: boolean) => void | Promise<void>;
  readonly label?: string;
  readonly disabled?: boolean;
}

export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps): JSX.Element {
  const [isBusy, change] = useBusyHandler(onChange);
  return (
    <label class={classNames('gw-toggle', (disabled || isBusy) && 'gw-toggle-disabled')}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled || isBusy}
        onChange={(event) => change(event.currentTarget.checked)}
      />
      <span class="gw-toggle-track" aria-hidden="true" />
      {label !== undefined && <span class="gw-toggle-label">{label}</span>}
    </label>
  );
}
