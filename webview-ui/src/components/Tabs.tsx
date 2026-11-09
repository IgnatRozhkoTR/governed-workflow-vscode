import type { JSX } from 'preact';
import { classNames, toneClass, type Tone } from './types';

export interface TabItem {
  readonly id: string;
  readonly label: string;
  readonly badge?: number | string;
  readonly tone?: Tone;
  readonly disabled?: boolean;
}

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly activeId: string;
  readonly onChange: (id: string) => void;
  readonly variant?: 'top' | 'sub';
}

export function Tabs({ items, activeId, onChange, variant = 'top' }: TabsProps): JSX.Element {
  return (
    <div class={`gw-tabs gw-tabs-${variant}`} role="tablist">
      {items.map((item) => (
        <button
          type="button"
          role="tab"
          key={item.id}
          class={classNames('gw-tab', item.id === activeId && 'gw-tab-active')}
          aria-selected={item.id === activeId}
          disabled={item.disabled}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.badge !== undefined && <span class={classNames('gw-tab-badge', toneClass(item.tone))}>{item.badge}</span>}
        </button>
      ))}
    </div>
  );
}
