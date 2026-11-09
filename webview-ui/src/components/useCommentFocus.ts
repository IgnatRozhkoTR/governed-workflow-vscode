import { useEffect, useState } from 'preact/hooks';
import { commentKey } from '../lib/comments';
import { useStore } from '../store/hooks';

export interface CommentFocus {
  readonly isOpen: boolean;
  toggle(): void;
  close(): void;
}

let openKey: string | undefined;
const listeners = new Set<(key: string | undefined) => void>();

function setOpenKey(key: string | undefined): void {
  openKey = key;
  listeners.forEach((listener) => listener(key));
}

// Like the web, only one inline comment thread is open at a time; a NavTarget.comment deep link opens the matching one.
export function useCommentFocus(scope: string, target: string): CommentFocus {
  const key = commentKey(scope, target);
  const [currentKey, setCurrentKey] = useState(openKey);
  const nav = useStore((s) => s.nav);
  useEffect(() => {
    listeners.add(setCurrentKey);
    return () => {
      listeners.delete(setCurrentKey);
    };
  }, []);
  useEffect(() => {
    if (nav.comment !== undefined && commentKey(nav.comment.scope, nav.comment.target) === key) {
      setOpenKey(key);
    }
  }, [nav, key]);
  const isOpen = currentKey === key;
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    return () => {
      if (openKey === key) {
        setOpenKey(undefined);
      }
    };
  }, [isOpen, key]);
  return {
    isOpen,
    toggle: () => setOpenKey(isOpen ? undefined : key),
    close: () => {
      if (openKey === key) {
        setOpenKey(undefined);
      }
    },
  };
}
