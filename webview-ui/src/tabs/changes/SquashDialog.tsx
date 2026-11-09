import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { HistoryCommit } from '../../api/changes';
import { Button, Dialog, TextField } from '../../components';
import { useT } from '../../i18n/i18n';
import { defaultSquashMessage } from './historyModel';

export interface SquashDialogProps {
  readonly commits: readonly HistoryCommit[];
  readonly onClose: () => void;
  readonly onConfirm: (message: string) => Promise<void>;
}

export function SquashDialog({ commits, onClose, onConfirm }: SquashDialogProps): JSX.Element {
  const t = useT();
  const [message, setMessage] = useState(() => defaultSquashMessage(commits));
  const [isBusy, setBusy] = useState(false);
  const isSubmittable = message.trim() !== '';
  const submit = async (): Promise<void> => {
    setBusy(true);
    try {
      await onConfirm(message.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      size="md"
      busy={isBusy}
      title={t('history.dialogs.squashTitle', { count: commits.length })}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" label={t('vsc.common.cancel')} disabled={isBusy} onClick={onClose} />
          <Button variant="primary" icon="git-merge" label={t('history.squash')} disabled={!isSubmittable} busy={isBusy} onClick={submit} />
        </>
      }
    >
      <ul class="gw-changes-squash-list">
        {commits.map((commit) => (
          <li key={commit.full_sha}>
            <code>{commit.sha}</code> {commit.subject}
          </li>
        ))}
      </ul>
      <label class="gw-field-label">{t('history.dialogs.squashMessage')}</label>
      <TextField multiline rows={6} autoFocus value={message} onInput={setMessage} />
    </Dialog>
  );
}
