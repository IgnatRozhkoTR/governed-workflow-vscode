import { useEffect } from 'preact/hooks';

// The header's gate and plan chips hand the decision to the pinned bar. The bar can mount only after the chip's
// navigation (the plan bar appears on Planning), so the request waits until a bar takes it.
let isFocusRequested = false;
const focusListeners = new Set<() => void>();

export function requestDecisionFocus(): void {
  isFocusRequested = true;
  focusListeners.forEach((listener) => listener());
}

function primaryActionIn(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>('.gw-button-primary:not(:disabled)')
    ?? container.querySelector<HTMLButtonElement>('button:not(:disabled)');
}

export function useDecisionFocusTarget(actionsRef: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    const takeFocus = (): void => {
      const target = actionsRef.current === null ? null : primaryActionIn(actionsRef.current);
      if (isFocusRequested && target !== null) {
        isFocusRequested = false;
        target.focus();
      }
    };
    focusListeners.add(takeFocus);
    takeFocus();
    return () => {
      focusListeners.delete(takeFocus);
    };
  }, []);
}
