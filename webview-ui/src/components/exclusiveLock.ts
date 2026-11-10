import { useEffect, useState } from 'preact/hooks';

// Marks the part of a locked task that talks to the server, after the user has confirmed.
export type Submit = <T>(work: () => Promise<T>) => Promise<T>;

export interface ExclusiveLock {
  run(task: (submit: Submit) => Promise<void>): Promise<void>;
  useIsHeld(): boolean;
  useIsSubmitting(): boolean;
}

interface LockFlags {
  readonly isHeld: boolean;
  readonly isSubmitting: boolean;
}

// One lock per decision kind, shared by every component that can take that decision (pinned bar, header shortcut,
// nav action), so a second entry point can never stack another confirm or POST while one is in flight.
// Held covers the whole task, confirm dialog included; submitting covers only the request, which is what dims buttons.
export function createExclusiveLock(): ExclusiveLock {
  let flags: LockFlags = { isHeld: false, isSubmitting: false };
  const listeners = new Set<() => void>();
  const update = (next: Partial<LockFlags>): void => {
    flags = { ...flags, ...next };
    listeners.forEach((listener) => listener());
  };
  const submit: Submit = async (work) => {
    update({ isSubmitting: true });
    try {
      return await work();
    } finally {
      update({ isSubmitting: false });
    }
  };
  const run = async (task: (submit: Submit) => Promise<void>): Promise<void> => {
    if (flags.isHeld) {
      return;
    }
    update({ isHeld: true });
    try {
      await task(submit);
    } finally {
      update({ isHeld: false });
    }
  };
  const useFlag = (read: (current: LockFlags) => boolean): boolean => {
    const [value, setValue] = useState(read(flags));
    useEffect(() => {
      const listener = (): void => setValue(read(flags));
      listeners.add(listener);
      listener();
      return () => {
        listeners.delete(listener);
      };
    }, []);
    return value;
  };
  return { run, useIsHeld: () => useFlag((current) => current.isHeld), useIsSubmitting: () => useFlag((current) => current.isSubmitting) };
}

// Button spins and disables itself while its click handler's promise is pending. A decision handler first waits on the
// confirm dialog, so it is detached from the button and reports busy itself, only once the user has confirmed.
export function detach(task: () => Promise<void>): () => void {
  return () => {
    void task();
  };
}
