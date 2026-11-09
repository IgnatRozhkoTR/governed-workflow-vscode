import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { describeError } from '../lib/format';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { useT } from '../i18n/i18n';

type ToastKind = 'info' | 'success' | 'error';

interface ToastEntry {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
}

export interface ToastApi {
  info(msg: string): void;
  success(msg: string): void;
  error(err: unknown): void;
}

const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = { info: 4000, success: 4000, error: 8000 };
const TOAST_ICONS: Readonly<Record<ToastKind, string>> = { info: 'info', success: 'pass', error: 'error' };

let entries: readonly ToastEntry[] = [];
let nextId = 1;
const listeners = new Set<(next: readonly ToastEntry[]) => void>();

function publish(next: readonly ToastEntry[]): void {
  entries = next;
  listeners.forEach((listener) => listener(entries));
}

function dismiss(id: number): void {
  publish(entries.filter((entry) => entry.id !== id));
}

function show(kind: ToastKind, message: string): void {
  const id = nextId++;
  publish([...entries, { id, kind, message }]);
  setTimeout(() => dismiss(id), TOAST_DURATION_MS[kind]);
}

export const toasts: ToastApi = {
  info: (msg) => show('info', msg),
  success: (msg) => show('success', msg),
  error: (err) => show('error', describeError(err)),
};

export function useToast(): ToastApi {
  return toasts;
}

export function ToastHost(): JSX.Element {
  const t = useT();
  const [visible, setVisible] = useState(entries);
  useEffect(() => {
    listeners.add(setVisible);
    return () => {
      listeners.delete(setVisible);
    };
  }, []);
  return (
    <div class="gw-toasts" aria-live="polite">
      {visible.map((entry) => (
        <div key={entry.id} class={`gw-toast gw-toast-${entry.kind}`} role={entry.kind === 'error' ? 'alert' : 'status'}>
          <Icon name={TOAST_ICONS[entry.kind]} />
          <span class="gw-toast-message">{entry.message}</span>
          <IconButton icon="close" title={t('buttons.close')} onClick={() => dismiss(entry.id)} />
        </div>
      ))}
    </div>
  );
}
