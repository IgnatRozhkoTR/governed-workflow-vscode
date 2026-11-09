import type { JSX } from 'preact';
import { useBusyHandler } from './Button';
import { classNames } from './types';

export interface RadioCardOption {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
}

export interface RadioCardsProps {
  readonly value: string;
  readonly options: readonly RadioCardOption[];
  readonly onChange: (v: string) => void | Promise<void>;
}

export function RadioCards({ value, options, onChange }: RadioCardsProps): JSX.Element {
  const [isBusy, change] = useBusyHandler(onChange);
  return (
    <div class="gw-radio-cards" role="radiogroup">
      {options.map((option) => (
        <button
          type="button"
          role="radio"
          key={option.value}
          aria-checked={option.value === value}
          disabled={isBusy}
          class={classNames('gw-radio-card', option.value === value && 'gw-radio-card-selected')}
          onClick={() => option.value !== value && change(option.value)}
        >
          <span class="gw-radio-card-title">{option.title}</span>
          {option.description !== undefined && <span class="gw-radio-card-description">{option.description}</span>}
        </button>
      ))}
    </div>
  );
}
