import type { JSX } from 'preact';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectProps {
  readonly value: string;
  readonly options: readonly SelectOption[];
  readonly onChange: (v: string) => void;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly ariaLabel?: string;
}

export function Select({ value, options, onChange, disabled = false, title, ariaLabel }: SelectProps): JSX.Element {
  return (
    <select class="gw-select" title={title} aria-label={ariaLabel ?? title} value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
