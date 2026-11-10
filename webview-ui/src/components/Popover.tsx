import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface PopoverProps {
  readonly open: boolean;
  readonly anchor: HTMLElement | null;
  readonly onClose: () => void;
  readonly children?: ComponentChildren;
  readonly placement?: Placement;
}

interface Position {
  readonly top: number;
  readonly left: number;
}

type Placement = 'bottom' | 'top';

const GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
// Scroll events do not bubble, so capturing on the document is what catches any scrolling container.
const SCROLL_LISTENER_OPTIONS: AddEventListenerOptions = { capture: true, passive: true };

// The popover renders inline, often inside a clickable row; its events must not reach that row's handlers.
function stopBubbling(event: Event): void {
  event.stopPropagation();
}

function clampToViewport(start: number, size: number, viewportSize: number): number {
  return Math.max(VIEWPORT_MARGIN_PX, Math.min(start, viewportSize - size - VIEWPORT_MARGIN_PX));
}

// Opens on the preferred side, flips when only the other side has room, and stays inside the viewport either way.
function verticalStart(anchorBox: DOMRect, height: number, placement: Placement): number {
  const below = anchorBox.bottom + GAP_PX;
  const above = anchorBox.top - height - GAP_PX;
  const fitsBelow = below + height <= window.innerHeight - VIEWPORT_MARGIN_PX;
  const fitsAbove = above >= VIEWPORT_MARGIN_PX;
  const isBelow = placement === 'bottom' ? fitsBelow || !fitsAbove : fitsBelow && !fitsAbove;
  return clampToViewport(isBelow ? below : above, height, window.innerHeight);
}

function computePosition(anchor: HTMLElement, popover: HTMLElement, placement: Placement): Position {
  const anchorBox = anchor.getBoundingClientRect();
  const popoverBox = popover.getBoundingClientRect();
  return {
    top: verticalStart(anchorBox, popoverBox.height, placement),
    left: clampToViewport(anchorBox.left, popoverBox.width, window.innerWidth),
  };
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
        anchor?.focus();
      }
    };
    document.addEventListener('mousedown', handlePointer, true);
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('mousedown', handlePointer, true);
      document.removeEventListener('keydown', handleKey, true);
    };
  }, [isOpen, anchor, onClose]);
}

export function Popover({ open, anchor, onClose, children, placement = 'bottom' }: PopoverProps): JSX.Element | null {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<Position | undefined>(undefined);
  useDismiss(open, anchor, popoverRef, onClose);
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!open || anchor === null || popover === null) {
      return undefined;
    }
    const reposition = (): void => setPosition(computePosition(anchor, popover, placement));
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(popover);
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', reposition, SCROLL_LISTENER_OPTIONS);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', reposition, SCROLL_LISTENER_OPTIONS);
    };
  }, [open, anchor, placement]);
  if (!open || anchor === null) {
    return null;
  }
  const style = position === undefined ? { visibility: 'hidden' as const } : { top: `${position.top}px`, left: `${position.left}px` };
  return (
    <div ref={popoverRef} class="gw-popover" role="dialog" style={style} onClick={stopBubbling} onMouseDown={stopBubbling} onKeyDown={stopBubbling}>
      {children}
    </div>
  );
}
