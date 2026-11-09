import type { RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '../store/hooks';

const HIGHLIGHT_MS = 1500;

export function useAnchorTarget<E extends HTMLElement>(id: string | undefined): [RefObject<E>, boolean] {
  const ref = useRef<E>(null);
  const nav = useStore((s) => s.nav);
  const [isHighlighted, setHighlighted] = useState(false);
  useEffect(() => {
    if (id === undefined || nav.anchor !== id || ref.current === null) {
      return undefined;
    }
    ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlighted(true);
    const timer = setTimeout(() => setHighlighted(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [id, nav]);
  return [ref, isHighlighted];
}
