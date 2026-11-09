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
}

export function Select({ value, options, onChange, disabled = false }: SelectProps): JSX.Element {
  return (
    <select class="gw-select" value={value} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
