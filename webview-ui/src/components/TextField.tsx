import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { isSubmitKey, type SubmitOn } from '../lib/submitKey';

export interface TextFieldProps {
  readonly id?: string;
  readonly value: string;
  readonly onInput: (v: string) => void;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly type?: 'text' | 'password';
  readonly multiline?: boolean;
  readonly rows?: number;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly onSubmit?: () => void;
  readonly submitOn?: SubmitOn;
}

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

export function TextField(props: TextFieldProps): JSX.Element {
  const { id, value, onInput, placeholder, ariaLabel, type = 'text', multiline = false, rows = 3, disabled = false, autoFocus = false, onSubmit } = props;
  const t = useT();
  const submitOn = props.submitOn ?? (multiline ? 'mod-enter' : 'enter');
  const ref = useRef<FieldElement>(null);
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
    }
  }, [autoFocus]);
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (onSubmit === undefined || !isSubmitKey(event, submitOn)) {
      return;
    }
    event.preventDefault();
    if (!(multiline && submitOn === 'enter') || value.trim() !== '') {
      onSubmit();
    }
  };
  const handleInput = (event: Event): void => onInput((event.currentTarget as FieldElement).value);
  const shared = { id, class: 'gw-input', value, placeholder, 'aria-label': ariaLabel, disabled, onInput: handleInput, onKeyDown: handleKeyDown };
  if (!multiline) {
    return <input {...shared} ref={ref as JSX.HTMLAttributes<HTMLInputElement>['ref']} type={type} autoComplete={type === 'password' ? 'off' : undefined} />;
  }
  const field = <textarea {...shared} ref={ref as JSX.HTMLAttributes<HTMLTextAreaElement>['ref']} rows={rows} />;
  if (onSubmit === undefined || submitOn !== 'enter') {
    return field;
  }
  return <>{field}<div class="gw-input-hint">{t('vsc.input.sendHint')}</div></>;
}
