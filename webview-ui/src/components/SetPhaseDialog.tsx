import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { setPhase } from '../api/core';
import { useT } from '../i18n/i18n';
import { useMutation, usePhaseLabel, useStore } from '../store/hooks';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { Select, type SelectOption } from './Select';
import { TextField } from './TextField';
import { toasts } from './ToastHost';

export interface SetPhaseDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const CUSTOM_PHASE = '__custom__';
const NO_PHASES: readonly string[] = [];

export function selectablePhases(sequence: readonly string[], currentPhase: string): readonly string[] {
  return currentPhase === '' || sequence.includes(currentPhase) ? sequence : [currentPhase, ...sequence];
}

export function canSubmitPhase(target: string, currentPhase: string, isPending: boolean): boolean {
  return !isPending && target !== '' && target !== currentPhase;
}

export function SetPhaseDialog({ open, onClose }: SetPhaseDialogProps): JSX.Element | null {
  const t = useT();
  const currentPhase = useStore((s) => s.state?.phase ?? '');
  const [choice, setChoice] = useState(currentPhase);
  const [customPhase, setCustomPhase] = useState('');
  useEffect(() => {
    if (open) {
      setChoice(currentPhase);
      setCustomPhase('');
    }
  }, [open]);
  const target = choice === CUSTOM_PHASE ? customPhase.trim() : choice;
  const change = useGuardedPhaseChange(currentPhase, onClose);
  const isSubmittable = canSubmitPhase(target, currentPhase, change.pending);
  const submit = (): Promise<void> => change.submit(target);
  const footer = (
    <>
      <Button label={t('vsc.common.cancel')} disabled={change.pending} onClick={onClose} />
      <Button variant="primary" label={t('buttons.setPhase')} busy={change.pending} disabled={!isSubmittable} title={target === currentPhase ? t('vsc.phase.sameAsCurrent') : undefined} onClick={submit} />
    </>
  );
  return (
    <Dialog open={open} title={t('buttons.setPhase')} onClose={onClose} footer={footer} busy={change.pending} size="sm">
      <label class="gw-field-label">{t('dialog.setPhase')}</label>
      <Select value={choice} options={usePhaseOptions(currentPhase)} disabled={change.pending} title={t('dialog.setPhase')} onChange={setChoice} />
      {choice === CUSTOM_PHASE && (
        <TextField value={customPhase} onInput={setCustomPhase} placeholder="3.1.0" autoFocus disabled={change.pending} onSubmit={() => void submit()} />
      )}
    </Dialog>
  );
}

function usePhaseOptions(currentPhase: string): readonly SelectOption[] {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const sequence = useStore((s) => s.state?.phase_sequence ?? NO_PHASES);
  const toOption = (phase: string): SelectOption => {
    const label = `${phase} · ${phaseLabel(phase)}`;
    return { value: phase, label: phase === currentPhase ? t('vsc.phase.currentOption', { label }) : label };
  };
  return [...selectablePhases(sequence, currentPhase).map(toOption), { value: CUSTOM_PHASE, label: t('vsc.phase.custom') }];
}

interface GuardedPhaseChange {
  readonly pending: boolean;
  submit(target: string): Promise<void>;
}

// Enter in the custom field fires once per key press, so the guard must hold before the mutation's pending state re-renders.
function useGuardedPhaseChange(currentPhase: string, onClose: () => void): GuardedPhaseChange {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const isSubmitting = useRef(false);
  const change = useMutation((phase: string) => setPhase(phase), { refreshState: true });
  const submit = async (target: string): Promise<void> => {
    if (isSubmitting.current || !canSubmitPhase(target, currentPhase, change.pending)) {
      return;
    }
    isSubmitting.current = true;
    try {
      const result = await change.run(target);
      if (result !== undefined) {
        toasts.success(t('vsc.phase.changed', { from: phaseLabel(result.previous_phase), to: phaseLabel(result.phase) }));
        onClose();
      }
    } finally {
      isSubmitting.current = false;
    }
  };
  return { pending: change.pending, submit };
}
