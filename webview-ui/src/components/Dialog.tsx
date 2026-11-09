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

function useInitialFocus(isOpen: boolean, dialogRef: { readonly current: HTMLElement | null }): void {
  useEffect(() => {
    if (!isOpen || dialogRef.current === null) {
      return undefined;
    }
    const previous = document.activeElement as HTMLElement | null;
    const target = dialogRef.current.querySelector<HTMLElement>('[autofocus], input, textarea, select') ?? dialogRef.current;
    target.focus();
    return () => previous?.focus();
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
