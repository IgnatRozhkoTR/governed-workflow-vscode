import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

export interface TextFieldProps {
  readonly value: string;
  readonly onInput: (v: string) => void;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly onSubmit?: () => void;
  readonly submitOn?: 'enter' | 'mod-enter';
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

function isSubmitKey(event: KeyboardEvent, submitOn: 'enter' | 'mod-enter'): boolean {
  if (event.key !== 'Enter' || event.isComposing) {
    return false;
  }
  return submitOn === 'enter' ? !event.shiftKey : event.ctrlKey || event.metaKey;
}

export function TextField(props: TextFieldProps): JSX.Element {
  const { value, onInput, placeholder, multiline = false, rows = 3, disabled = false, autoFocus = false, onSubmit } = props;
  const submitOn = props.submitOn ?? (multiline ? 'mod-enter' : 'enter');
  const ref = useRef<FieldElement>(null);
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus]);
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (onSubmit !== undefined && isSubmitKey(event, submitOn)) {
      event.preventDefault();
      onSubmit();
    }
  };
  const handleInput = (event: Event): void => onInput((event.currentTarget as FieldElement).value);
  const shared = { class: 'gw-input', value, placeholder, disabled, onInput: handleInput, onKeyDown: handleKeyDown };
  return multiline
    ? <textarea {...shared} ref={ref as JSX.HTMLAttributes<HTMLTextAreaElement>['ref']} rows={rows} />
    : <input {...shared} ref={ref as JSX.HTMLAttributes<HTMLInputElement>['ref']} type="text" />;
}
