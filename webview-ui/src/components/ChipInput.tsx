import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { IconButton } from './IconButton';
import { ErrorBanner } from './ErrorBanner';
import { TextField } from './TextField';
import { useT } from '../i18n/i18n';

export interface ChipInputProps {
  readonly values: readonly string[];
  readonly onAdd: (v: string) => void;
  readonly onRemove: (v: string) => void;
  readonly suggest?: (q: string) => Promise<readonly string[]>;
  readonly minChars?: number;
  readonly debounceMs?: number;
  readonly placeholder?: string;
}

interface Suggestions {
  readonly items: readonly string[];
  readonly error: unknown;
}

const NO_SUGGESTIONS: Suggestions = { items: [], error: undefined };

function useSuggestions(query: string, suggest: ChipInputProps['suggest'], minChars: number, debounceMs: number): Suggestions {
  const [suggestions, setSuggestions] = useState<Suggestions>(NO_SUGGESTIONS);
  useEffect(() => {
    setSuggestions(NO_SUGGESTIONS);
    if (suggest === undefined || query.trim().length < minChars) {
      return undefined;
    }
    let isCurrent = true;
    const timer = setTimeout(() => {
      suggest(query.trim()).then(
        (items) => isCurrent && setSuggestions({ items, error: undefined }),
        (error: unknown) => isCurrent && setSuggestions({ items: [], error }),
      );
    }, debounceMs);
    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [query, suggest, minChars, debounceMs]);
  return suggestions;
}

export function ChipInput(props: ChipInputProps): JSX.Element {
  const { values, onAdd, onRemove, suggest, minChars = 2, debounceMs = 200, placeholder } = props;
  const t = useT();
  const [query, setQuery] = useState('');
  const suggestions = useSuggestions(query, suggest, minChars, debounceMs);
  const add = (value: string): void => {
    const trimmed = value.trim();
    if (trimmed !== '' && !values.includes(trimmed)) {
      onAdd(trimmed);
    }
    setQuery('');
  };
  return (
    <div class="gw-chip-input">
      <div class="gw-chips">
        {values.map((value) => (
          <span class="gw-chip" key={value}>
            <span class="gw-chip-label">{value}</span>
            <IconButton icon="close" title={t('vsc.common.remove')} onClick={() => onRemove(value)} />
          </span>
        ))}
      </div>
      <TextField value={query} onInput={setQuery} placeholder={placeholder} onSubmit={() => add(query)} />
      {suggestions.error !== undefined && <ErrorBanner error={suggestions.error} />}
      {suggestions.items.length > 0 && (
        <ul class="gw-chip-suggestions" role="listbox">
          {suggestions.items.map((item) => (
            <li key={item} role="option" aria-selected={false} onMouseDown={(event) => { event.preventDefault(); add(item); }}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
