import type { GateResult, PendingGate } from '@api-types';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { approveGate, rejectGate } from '../api/core';
import { useT } from '../i18n/i18n';
import { useMutation, usePhaseLabel } from '../store/hooks';
import { Button } from './Button';
import { useDialogs } from './DialogHost';
import { TextField } from './TextField';
import { toasts } from './ToastHost';
import { Toolbar } from './Toolbar';

export interface GateActionsProps {
  readonly gate: PendingGate;
}

const GATE_MUTATION = { refreshState: true } as const;

export function GateActions({ gate }: GateActionsProps): JSX.Element {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const dialogs = useDialogs();
  const [commitMessage, setCommitMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const approve = useMutation((message: string | undefined) => approveGate(message), GATE_MUTATION);
  const reject = useMutation((comments: string) => rejectGate(comments), GATE_MUTATION);
  const report = (result: GateResult | undefined, key: string): void => {
    if (result !== undefined) {
      toasts.success(t(key, { phase: phaseLabel(result.phase) }));
    }
  };
  const handleApprove = async (): Promise<void> => {
    if (await dialogs.confirm({ title: t('buttons.approve'), message: phaseLabel(gate.phase), confirmLabel: t('buttons.approve') })) {
      const message = commitMessage.trim();
      report(await approve.run(message === '' ? undefined : message), 'messages.approved');
    }
  };
  const handleReject = async (): Promise<void> => {
    if (feedback.trim() === '') {
      toasts.info(t('errors.pleaseProvideFeedback'));
    } else if (await dialogs.confirm({ title: t('buttons.requestChanges'), message: feedback.trim(), confirmLabel: t('buttons.requestChanges'), danger: true })) {
      report(await reject.run(feedback.trim()), 'messages.rejected');
    }
  };
  return (
    <div class="gw-gate-actions">
      <div class="gw-gate-title">{phaseLabel(gate.phase)}</div>
      {gate.accepts_commit_message && <TextField value={commitMessage} onInput={setCommitMessage} placeholder={t('placeholders.commitMessage')} />}
      <TextField value={feedback} onInput={setFeedback} placeholder={t('placeholders.feedbackForChanges')} multiline rows={3} />
      <Toolbar>
        <Button variant="primary" icon="check" label={t('buttons.approve')} busy={approve.pending} disabled={reject.pending} onClick={handleApprove} />
        <Button variant="danger" icon="close" label={t('buttons.requestChanges')} busy={reject.pending} disabled={approve.pending} onClick={handleReject} />
      </Toolbar>
    </div>
  );
}
