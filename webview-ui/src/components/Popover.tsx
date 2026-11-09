import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface PopoverProps {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
  readonly children?: ComponentChildren;
  readonly placement?: 'bottom' | 'top';
}

interface Position {
  readonly top: number;
  readonly left: number;
}

const GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

function computePosition(anchor: HTMLElement, popover: HTMLElement, placement: 'bottom' | 'top'): Position {
  const anchorBox = anchor.getBoundingClientRect();
  const popoverBox = popover.getBoundingClientRect();
  const top = placement === 'bottom' ? anchorBox.bottom + GAP_PX : anchorBox.top - popoverBox.height - GAP_PX;
  const maxLeft = window.innerWidth - popoverBox.width - VIEWPORT_MARGIN_PX;
  return { top: Math.max(VIEWPORT_MARGIN_PX, top), left: Math.max(VIEWPORT_MARGIN_PX, Math.min(anchorBox.left, maxLeft)) };
}

function useDismiss(isOpen: boolean, anchor: HTMLElement | null, popoverRef: { readonly current: HTMLElement | null }, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handlePointer = (event: MouseEvent): void => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target) !== true && anchor?.contains(target) !== true) {
        onClose();
      }
    };
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, anchor, onClose]);
}

export function Popover({ open, anchor, onClose, children, placement = 'bottom' }: PopoverProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | undefined>(undefined);
  useDismiss(open, anchor, popoverRef, onClose);
  useLayoutEffect(() => {
    if (open && anchor !== null && popoverRef.current !== null) {
      setPosition(computePosition(anchor, popoverRef.current, placement));
    }
  }, [open, anchor, placement]);
  if (!open || anchor === null) {
    return null;
  }
  const style = position === undefined ? { visibility: 'hidden' as const } : { top: `${position.top}px`, left: `${position.left}px` };
  return <div ref={popoverRef} class="gw-popover" role="dialog" style={style}>{children}</div>;
}
