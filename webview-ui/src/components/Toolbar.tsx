import type { ComponentChildren, JSX } from 'preact';

export interface ToolbarProps {
  readonly children?: ComponentChildren;
  readonly align?: 'start' | 'end' | 'between';
}

export function Toolbar({ children, align = 'start' }: ToolbarProps): JSX.Element {
  return <div class={`gw-toolbar gw-toolbar-${align}`}>{children}</div>;
}
