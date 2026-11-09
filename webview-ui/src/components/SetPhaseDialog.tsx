import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { setPhase } from '../api/core';
import { useT } from '../i18n/i18n';
import { useMutation, usePhaseLabel, useStore } from '../store/hooks';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Select } from './Select';
import { TextField } from './TextField';
import { toasts } from './ToastHost';

export interface SetPhaseDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const CUSTOM_PHASE = '__custom__';
const NO_PHASES: readonly string[] = [];

export function SetPhaseDialog({ open, onClose }: SetPhaseDialogProps): JSX.Element | null {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const sequence = useStore((s) => s.state?.phase_sequence ?? NO_PHASES);
  const currentPhase = useStore((s) => s.state?.phase ?? '');
  const [choice, setChoice] = useState(currentPhase);
  const [customPhase, setCustomPhase] = useState('');
  useEffect(() => {
    if (open) {
      setChoice(currentPhase);
      setCustomPhase('');
    }
  }, [open]);
  const change = useMutation((phase: string) => setPhase(phase), { refreshState: true });
  const target = choice === CUSTOM_PHASE ? customPhase.trim() : choice;
  const submit = async (): Promise<void> => {
    const result = await change.run(target);
    if (result !== undefined) {
      toasts.success(t('vsc.phase.changed', { from: phaseLabel(result.previous_phase), to: phaseLabel(result.phase) }));
      onClose();
    }
  };
  const options = [...sequence.map((phase) => ({ value: phase, label: `${phase} · ${phaseLabel(phase)}` })), { value: CUSTOM_PHASE, label: t('vsc.phase.custom') }];
  const footer = (
    <>
      <Button label={t('vsc.common.cancel')} disabled={change.pending} onClick={onClose} />
      <Button variant="primary" label={t('buttons.setPhase')} busy={change.pending} disabled={target === ''} onClick={submit} />
    </>
  );
  return (
    <Dialog open={open} title={t('buttons.setPhase')} onClose={onClose} footer={footer} busy={change.pending} size="sm">
      <label class="gw-field-label">{t('dialog.setPhase')}</label>
      <Select value={choice} options={options} onChange={setChoice} />
      {choice === CUSTOM_PHASE && <TextField value={customPhase} onInput={setCustomPhase} placeholder="3.1.0" autoFocus onSubmit={() => void submit()} />}
    </Dialog>
  );
}
