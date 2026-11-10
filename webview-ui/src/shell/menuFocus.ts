import { useEffect, useRef } from 'preact/hooks';
import { menuFocusIndex } from './layout';

// Focuses the first item when a menu opens and moves between items with the arrow keys, Home and End.
export function useMenuFocus(): { readonly menuRef: { readonly current: HTMLDivElement | null }; readonly handleKeyDown: (event: KeyboardEvent) => void } {
  const menuRef = useRef<HTMLDivElement>(null);
  const items = (): HTMLElement[] => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)') ?? []);
  useEffect(() => {
    items()[0]?.focus();
  }, []);
  const handleKeyDown = (event: KeyboardEvent): void => {
    const all = items();
    const next = menuFocusIndex(event.key, all.indexOf(document.activeElement as HTMLElement), all.length);
    if (next !== undefined) {
      event.preventDefault();
      all[next]?.focus();
    }
  };
  return { menuRef, handleKeyDown };
}
