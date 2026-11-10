import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { describeError } from '../lib/format';
import { Icon } from './Icon';
import { IconButton } from './IconButton';
import { useT } from '../i18n/i18n';

type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

interface ToastEntry {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
  readonly action?: ToastAction;
}

export interface ToastApi {
  info(msg: string): void;
  success(msg: string, action?: ToastAction): void;
  error(err: unknown): void;
}

const TOAST_DURATION_MS: Readonly<Record<ToastKind, number>> = { info: 4000, success: 4000, error: 8000 };
// An undo offer needs enough time to be noticed and clicked.
const ACTION_TOAST_DURATION_MS = 8000;
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

function show(kind: ToastKind, message: string, action?: ToastAction): void {
  const id = nextId++;
  publish([...entries, { id, kind, message, action }]);
  setTimeout(() => dismiss(id), action === undefined ? TOAST_DURATION_MS[kind] : ACTION_TOAST_DURATION_MS);
}

function runAction(id: number, action: ToastAction): void {
  dismiss(id);
  action.run();
}

export const toasts: ToastApi = {
  info: (msg) => show('info', msg),
  success: (msg, action) => show('success', msg, action),
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
    setVisible(entries);
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
          {entry.action !== undefined && (
            <button type="button" class="gw-toast-action" onClick={() => entry.action !== undefined && runAction(entry.id, entry.action)}>{entry.action.label}</button>
          )}
          <IconButton icon="close" title={t('buttons.close')} onClick={() => dismiss(entry.id)} />
        </div>
      ))}
    </div>
  );
}
