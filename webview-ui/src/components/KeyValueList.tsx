import type { ComponentChildren, JSX } from 'preact';

export interface KeyValueListProps {
  readonly items: readonly { readonly label: string; readonly value: ComponentChildren }[];
}

export function KeyValueList({ items }: KeyValueListProps): JSX.Element {
  return (
    <dl class="gw-key-value-list">
      {items.map((item) => (
        <div class="gw-key-value-row" key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
