import type { JSX } from 'preact';
import { isVerificationRun, getVerificationResults, runVerification, type VerificationRun, type VerificationStepResult } from '../../api/verification';
import { Badge, Button, Card, CodeBlock, Collapsible, EmptyState, ResourceView, TimeAgo } from '../../components';
import { toasts } from '../../components/ToastHost';
import type { Tone } from '../../components/types';
import { useT } from '../../i18n/i18n';
import { useMutation, useResource, useWorkspaceState } from '../../store/hooks';

const STATUS_TONES: Readonly<Record<string, Tone>> = { passed: 'success', failed: 'danger', skipped: 'neutral', running: 'info' };
const MS_PER_SECOND = 1000;

function toneOf(status: string): Tone {
  return STATUS_TONES[status] ?? 'warning';
}

function StepResult({ step }: { readonly step: VerificationStepResult }): JSX.Element {
  const duration = step.duration_ms === null || step.duration_ms === 0 ? '' : ` (${(step.duration_ms / MS_PER_SECOND).toFixed(1)}s)`;
  const header = (
    <span class="gw-verification-step-header">
      <Badge label={step.status.toUpperCase()} tone={toneOf(step.status)} />
      <span>{step.profile_name} / {step.step_name}{duration}</span>
    </span>
  );
  if (step.output === null || step.output === '') {
    return <div class="gw-verification-step">{header}</div>;
  }
  return (
    <div class="gw-verification-step">
      <Collapsible summary={header} defaultOpen={step.status === 'failed'}>
        <CodeBlock code={step.output} maxHeight={280} />
      </Collapsible>
    </div>
  );
}

function RunBody({ run }: { readonly run: VerificationRun }): JSX.Element {
  const t = useT();
  return (
    <div class="gw-verification-run">
      <div class="gw-verification-run-header">
        <Badge label={run.status.toUpperCase()} tone={toneOf(run.status)} />
        <span>{t('phase.label', { phase: run.phase })}</span>
        <TimeAgo iso={run.completed_at ?? run.started_at} />
      </div>
      {run.steps.map((step) => <StepResult key={step.id} step={step} />)}
    </div>
  );
}

function reportRun(t: ReturnType<typeof useT>, outcome: Awaited<ReturnType<typeof runVerification>>): void {
  if (!isVerificationRun(outcome)) {
    toasts.info(outcome.message);
  } else if (outcome.status === 'passed') {
    toasts.success(t('verification.runPassed'));
  } else {
    toasts.info(outcome.status === 'failed' ? t('verification.runFailed') : outcome.status);
  }
}

export function VerificationResultsCard({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const phase = useWorkspaceState().phase;
  const results = useResource('verification', 'results', () => getVerificationResults(), { active });
  const run = useMutation(() => runVerification(phase), { invalidates: ['verification'] });
  const handleRun = async (): Promise<void> => {
    const outcome = await run.run();
    if (outcome !== undefined) {
      reportRun(t, outcome);
    }
  };
  const runButton = <Button size="sm" icon="play" label={run.pending ? t('verification.running') : t('verification.run')} busy={run.pending} onClick={handleRun} />;
  return (
    <Card id="verification-results" title={t('cards.verificationResults')} actions={runButton}>
      <ResourceView resource={results}>
        {(data) => (isVerificationRun(data) ? <RunBody run={data} /> : <EmptyState icon="beaker" message={t('verification.noRuns')} />)}
      </ResourceView>
    </Card>
  );
}
