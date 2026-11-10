import type { JSX } from 'preact';
import { useEffect, useId, useState } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { TextField } from './TextField';

// A point the user may want to check before confirming; opening it cancels the dialog and goes to the material.
export interface DialogNotice {
  readonly text: string;
  readonly onOpen: () => void;
}

export interface ConfirmOptions {
  readonly title: string;
  readonly message?: string;
  readonly notices?: readonly DialogNotice[];
  readonly confirmLabel?: string;
  readonly danger?: boolean;
}

export interface PromptOptions {
  readonly title: string;
  readonly message?: string;
  readonly notices?: readonly DialogNotice[];
  readonly placeholder?: string;
  // Shown above the field; without it the field is named after the dialog title, since a placeholder is no label.
  readonly fieldLabel?: string;
  readonly initialValue?: string;
  readonly multiline?: boolean;
  readonly required?: boolean;
  readonly confirmLabel?: string;
  readonly danger?: boolean;
}

export interface AlertOptions {
  readonly title: string;
  readonly message: string;
  // Listed under the message without the "you can approve" heading, since an alert offers no way to go ahead.
  readonly notices?: readonly DialogNotice[];
}

export interface DialogsApi {
  confirm(o: ConfirmOptions): Promise<boolean>;
  prompt(o: PromptOptions): Promise<string | undefined>;
  alert(o: AlertOptions): Promise<void>;
}

type DialogRequestBody =
  | { readonly kind: 'confirm'; readonly options: ConfirmOptions; readonly settle: (value: boolean) => void }
  | { readonly kind: 'prompt'; readonly options: PromptOptions; readonly settle: (value: string | undefined) => void }
  | { readonly kind: 'alert'; readonly options: AlertOptions; readonly settle: () => void };

type DialogRequest = DialogRequestBody & { readonly id: number };

let queue: readonly DialogRequest[] = [];
let nextRequestId = 1;
const listeners = new Set<(next: readonly DialogRequest[]) => void>();

function publish(next: readonly DialogRequest[]): void {
  queue = next;
  listeners.forEach((listener) => listener(queue));
}

function enqueue<T>(build: (settle: (value: T) => void) => DialogRequestBody): Promise<T> {
  return new Promise<T>((resolve) => {
    const id = nextRequestId++;
    const request: DialogRequest = {
      ...build((value) => {
        publish(queue.filter((entry) => entry.id !== id));
        resolve(value);
      }),
      id,
    };
    publish([...queue, request]);
  });
}

const dialogs: DialogsApi = {
  confirm: (options) => enqueue<boolean>((settle) => ({ kind: 'confirm', options, settle })),
  prompt: (options) => enqueue<string | undefined>((settle) => ({ kind: 'prompt', options, settle })),
  alert: (options) => enqueue<void>((settle) => ({ kind: 'alert', options, settle })),
};

export function useDialogs(): DialogsApi {
  return dialogs;
}

export function DialogHost(): JSX.Element | null {
  const [pending, setPending] = useState(queue);
  useEffect(() => {
    listeners.add(setPending);
    setPending(queue);
    return () => {
      listeners.delete(setPending);
    };
  }, []);
  const current = pending[0];
  if (current === undefined) {
    return null;
  }
  // Keyed by request so a prompt's typed value never carries over to the next queued prompt.
  return <CurrentDialog key={current.id} request={current} />;
}

function CurrentDialog({ request }: { readonly request: DialogRequest }): JSX.Element {
  switch (request.kind) {
    case 'confirm':
      return <ConfirmDialog request={request} />;
    case 'prompt':
      return <PromptDialog request={request} />;
    case 'alert':
      return <AlertDialog request={request} />;
  }
}

function ConfirmDialog({ request }: { readonly request: Extract<DialogRequest, { kind: 'confirm' }> }): JSX.Element {
  const t = useT();
  const { title, message, notices = [], confirmLabel, danger = false } = request.options;
  const footer = (
    <>
      <Button label={t('vsc.common.cancel')} onClick={() => request.settle(false)} />
      <Button variant={danger ? 'danger' : 'primary'} label={confirmLabel ?? t('vsc.common.confirm')} autoFocus onClick={() => request.settle(true)} />
    </>
  );
  return (
    <Dialog open title={title} size="sm" onClose={() => request.settle(false)} footer={footer}>
      {message !== undefined && <p class="gw-dialog-message">{message}</p>}
      <DialogNotices notices={notices} heading={t('vsc.warning.heading')} onLeave={() => request.settle(false)} />
    </Dialog>
  );
}

function PromptDialog({ request }: { readonly request: Extract<DialogRequest, { kind: 'prompt' }> }): JSX.Element {
  const t = useT();
  const { title, message, notices = [], placeholder, fieldLabel, initialValue = '', multiline = false, required = false, confirmLabel, danger = false } = request.options;
  const [value, setValue] = useState(initialValue);
  const fieldId = useId();
  const isSubmittable = !required || value.trim() !== '';
  const submit = (): void => {
    if (isSubmittable) {
      request.settle(value);
    }
  };
  const footer = (
    <>
      <Button label={t('vsc.common.cancel')} onClick={() => request.settle(undefined)} />
      <Button variant={danger ? 'danger' : 'primary'} label={confirmLabel ?? t('vsc.common.ok')} disabled={!isSubmittable} onClick={submit} />
    </>
  );
  return (
    <Dialog open title={title} size="md" onClose={() => request.settle(undefined)} footer={footer}>
      {message !== undefined && <p class="gw-dialog-message">{message}</p>}
      <DialogNotices notices={notices} heading={t('vsc.warning.heading')} onLeave={() => request.settle(undefined)} />
      {fieldLabel !== undefined && <label class="gw-dialog-field-label" for={fieldId}>{fieldLabel}</label>}
      <TextField id={fieldId} value={value} onInput={setValue} placeholder={placeholder} ariaLabel={fieldLabel === undefined ? title : undefined} multiline={multiline} rows={5} autoFocus onSubmit={submit} />
    </Dialog>
  );
}

interface DialogNoticesProps {
  readonly notices: readonly DialogNotice[];
  readonly heading?: string;
  readonly onLeave: () => void;
}

function DialogNotices({ notices, heading, onLeave }: DialogNoticesProps): JSX.Element | null {
  if (notices.length === 0) {
    return null;
  }
  const open = (notice: DialogNotice): void => {
    onLeave();
    notice.onOpen();
  };
  return (
    <div class="gw-dialog-notices" role="group" aria-label={heading}>
      {heading !== undefined && <p class="gw-dialog-notices-heading">{heading}</p>}
      <ul class="gw-dialog-notices-list">
        {notices.map((notice) => (
          <li key={notice.text}>
            <button type="button" class="gw-link gw-dialog-notice" onClick={() => open(notice)}>
              <Icon name="warning" />
              <span>{notice.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AlertDialog({ request }: { readonly request: Extract<DialogRequest, { kind: 'alert' }> }): JSX.Element {
  const t = useT();
  return (
    <Dialog open title={request.options.title} size="sm" onClose={() => request.settle()} footer={<Button variant="primary" label={t('vsc.common.ok')} onClick={() => request.settle()} />}>
      <p class="gw-dialog-message">{request.options.message}</p>
      <DialogNotices notices={request.options.notices ?? []} onLeave={() => request.settle()} />
    </Dialog>
  );
}
