import { useState } from 'preact/hooks';
import { getPersisted, setPersisted } from '../rpc/vscodeApi';

const OPEN_STATE_PREFIX = 'ui.open.';

export function useOpenState(initial: boolean, persistKey: string | undefined): [boolean, () => void] {
  const storageKey = persistKey === undefined ? undefined : `${OPEN_STATE_PREFIX}${persistKey}`;
  const [isOpen, setOpen] = useState(() => (storageKey === undefined ? initial : getPersisted<boolean>(storageKey) ?? initial));
  const toggle = (): void => {
    const next = !isOpen;
    setOpen(next);
    if (storageKey !== undefined) {
      setPersisted(storageKey, next);
    }
  };
  return [isOpen, toggle];
}
