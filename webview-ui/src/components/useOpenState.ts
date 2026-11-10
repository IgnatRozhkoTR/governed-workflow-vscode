import { useState } from 'preact/hooks';
import { getPersisted, setPersisted } from '../rpc/vscodeApi';

const OPEN_STATE_PREFIX = 'ui.open.';

export function useOpenState(initial: boolean, persistKey: string | undefined): [boolean, () => void, (next: boolean) => void] {
  const storageKey = persistKey === undefined ? undefined : `${OPEN_STATE_PREFIX}${persistKey}`;
  const [isOpen, setOpenState] = useState(() => (storageKey === undefined ? initial : getPersisted<boolean>(storageKey) ?? initial));
  const setOpen = (next: boolean): void => {
    setOpenState(next);
    if (storageKey !== undefined) {
      setPersisted(storageKey, next);
    }
  };
  return [isOpen, () => setOpen(!isOpen), setOpen];
}
