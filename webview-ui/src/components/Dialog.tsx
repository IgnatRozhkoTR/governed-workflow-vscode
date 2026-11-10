import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { IconButton } from './IconButton';

export interface DialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children?: ComponentChildren;
  readonly footer?: ComponentChildren;
  readonly size?: 'sm' | 'md' | 'lg' | 'full';
  readonly busy?: boolean;
}

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(event: KeyboardEvent, dialog: HTMLElement): void {
  const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// In priority order: an explicit autofocus wins over the first field, which wins over the dialog itself.
const INITIAL_FOCUS_SELECTORS = ['[data-autofocus]', '[autofocus]', 'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'];
const FOCUS_FALLBACK_SELECTOR = '#gw-main';

function initialFocusTarget(dialog: HTMLElement): HTMLElement {
  for (const selector of INITIAL_FOCUS_SELECTORS) {
    const match = dialog.querySelector<HTMLElement>(selector);
    if (match !== null) {
      return match;
    }
  }
  return dialog;
}

const REFOCUS_WAIT_LIMIT_MS = 30_000;

function isDisabled(element: HTMLElement): boolean {
  return (element as HTMLButtonElement).disabled === true;
}

function isUsableTrigger(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && element.isConnected && element !== document.body;
}

function isFocusParkedOn(placeholder: HTMLElement | null): boolean {
  const active = document.activeElement;
  return active === null || active === document.body || active === placeholder;
}

// A trigger stays disabled while the action it confirmed runs; focus waits on the main area and returns once the trigger is usable again,
// unless the user has moved focus elsewhere in the meantime.
function focusWhenReEnabled(trigger: HTMLElement, placeholder: HTMLElement | null): void {
  const observer = new MutationObserver(() => {
    if (!trigger.isConnected) {
      stop();
    } else if (!isDisabled(trigger)) {
      stop();
      if (isFocusParkedOn(placeholder)) {
        trigger.focus();
      }
    }
  });
  const timer = setTimeout(() => stop(), REFOCUS_WAIT_LIMIT_MS);
  function stop(): void {
    observer.disconnect();
    clearTimeout(timer);
  }
  observer.observe(trigger, { attributes: true, attributeFilter: ['disabled'] });
}

function restoreFocus(previous: Element | null): void {
  if (isUsableTrigger(previous) && !isDisabled(previous)) {
    previous.focus();
    return;
  }
  const placeholder = document.querySelector<HTMLElement>(FOCUS_FALLBACK_SELECTOR);
  placeholder?.focus({ preventScroll: true });
  if (isUsableTrigger(previous)) {
    focusWhenReEnabled(previous, placeholder);
  }
}

// Captured while rendering: child effects (an autofocused button) run before ours and would already have moved focus.
function useFocusBeforeOpen(isOpen: boolean): { readonly current: Element | null } {
  const previous = useRef<Element | null>(null);
  const wasOpen = useRef(false);
  if (isOpen && !wasOpen.current) {
    previous.current = document.activeElement;
  }
  wasOpen.current = isOpen;
  return previous;
}

function useInitialFocus(isOpen: boolean, dialogRef: { readonly current: HTMLElement | null }): void {
  const previous = useFocusBeforeOpen(isOpen);
  useEffect(() => {
    if (!isOpen || dialogRef.current === null) {
      return undefined;
    }
    initialFocusTarget(dialogRef.current).focus();
    return () => restoreFocus(previous.current);
  }, [isOpen]);
}

export function Dialog({ open, title, onClose, children, footer, size = 'md', busy = false }: DialogProps): JSX.Element | null {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  useInitialFocus(open, dialogRef);
  if (!open) {
    return null;
  }
  const close = (): void => {
    if (!busy) {
      onClose();
    }
  };
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    } else if (event.key === 'Tab' && dialogRef.current !== null) {
      trapFocus(event, dialogRef.current);
    }
  };
  return (
    <div class="gw-dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div ref={dialogRef} class={`gw-dialog gw-dialog-${size}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={handleKeyDown}>
        <header class="gw-dialog-header">
          <h2>{title}</h2>
          <IconButton icon="close" title={t('buttons.close')} onClick={close} disabled={busy} />
        </header>
        <div class="gw-dialog-body">{children}</div>
        {footer !== undefined && <footer class="gw-dialog-footer">{footer}</footer>}
      </div>
    </div>
  );
}
