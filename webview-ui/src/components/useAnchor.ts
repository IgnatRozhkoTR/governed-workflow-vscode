import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../store/hooks';

const HIGHLIGHT_MS = 2500;
const STICKY_TOP_HEIGHT_PROPERTY = '--gw-sticky-top-height';

function stickyTopHeight(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(STICKY_TOP_HEIGHT_PROPERTY));
  return Number.isFinite(value) ? value : 0;
}

// A tall target centred in the viewport would hide its own header under the sticky header, so it aligns to the top instead.
export function anchorScrollBlock(elementHeight: number, viewportHeight: number, stickyHeight: number): ScrollLogicalPosition {
  return elementHeight > viewportHeight - stickyHeight ? 'start' : 'center';
}

export function scrollToAnchor(element: HTMLElement): void {
  const block = anchorScrollBlock(element.getBoundingClientRect().height, window.innerHeight, stickyTopHeight());
  element.scrollIntoView({ behavior: 'smooth', block });
}

// The highlight outlives later nav updates (e.g. the host echoing the remembered tab without the anchor), so it is timer-driven only.
// onReveal lets a collapsed target expand first; the scroll waits a frame so it measures the expanded height.
export function useAnchorTarget<E extends HTMLElement>(id: string | undefined, onReveal?: () => void): [RefObject<E>, boolean] {
  const ref = useRef<E>(null);
  const nav = useStore((s) => s.nav);
  const [isHighlighted, setHighlighted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    const element = ref.current;
    if (id === undefined || nav.anchor !== id || element === null) {
      return;
    }
    onReveal?.();
    requestAnimationFrame(() => scrollToAnchor(element));
    setHighlighted(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
  }, [id, nav]);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  return [ref, isHighlighted];
}

// A section anchor can stand for a group of collapsed cards, so each member opens when its group is the target.
export function useRevealOnAnchor(id: string | undefined, reveal: () => void): void {
  const nav = useStore((s) => s.nav);
  useEffect(() => {
    if (id !== undefined && nav.anchor === id) {
      reveal();
    }
  }, [id, nav]);
}
