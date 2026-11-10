import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { startReviewPipeline, getReviewPipelineStatus, type AgentState, type ReviewPipelineStatus } from '../../api/phaseControl';
import { Badge, Button, Card, CodeRef, Icon, ResourceView, useDialogs } from '../../components';
import { toasts } from '../../components/ToastHost';
import { classNames } from '../../components/types';
import { useT } from '../../i18n/i18n';
import { RpcError } from '../../rpc/rpcClient';
import { useMutation, useResource, useStore, useWorkspaceState } from '../../store/hooks';
import { EmptySectionLine } from './EmptySectionLine';
import { agentIcon, canStartPipeline, elapsedSeconds, filesProgress, isBeforeReviewStart, isPipelineActive, POLL_INTERVAL_MS, REVIEW_START_PHASE, stateTone } from './pipelineModel';

const NO_PHASES: readonly string[] = [];

interface PipelineView {
  readonly status?: ReviewPipelineStatus;
}

async function loadPipeline(workspaceId: number): Promise<PipelineView> {
  try {
    return { status: await getReviewPipelineStatus(workspaceId) };
  } catch (error) {
    if (error instanceof RpcError && error.status === 404) {
      return {};
    }
    throw error;
  }
}

function AgentIcon({ status }: { readonly status: AgentState }): JSX.Element {
  return <span class={classNames('gw-pipeline-icon', `gw-pipeline-icon-${status}`)}><Icon name={agentIcon(status)} spin={status === 'running'} /></span>;
}

function AgentRow({ name, status, error }: { readonly name: string; readonly status: AgentState; readonly error?: string | null }): JSX.Element {
  const t = useT();
  return (
    <div class="gw-pipeline-row">
      <AgentIcon status={status} />
      <span class="gw-pipeline-name">{name}</span>
      <span class="gw-muted">{t(`reviewPipeline.fileStatus.${status}`)}</span>
      {error !== null && error !== undefined && error !== '' && <div class="gw-pipeline-error">{error}</div>}
    </div>
  );
}

function FilesSection({ status }: { readonly status: ReviewPipelineStatus }): JSX.Element | null {
  const t = useT();
  const files = Object.values(status.files);
  if (files.length === 0) {
    return null;
  }
  const { done, total } = filesProgress(status.files);
  return (
    <section class="gw-pipeline-section">
      <h4 class="gw-pipeline-heading">
        {t('reviewPipeline.filesSection')}
        <span class="gw-muted">{t('reviewPipeline.filesProgress', { done, total })}</span>
      </h4>
      {files.map((file) => (
        <div key={file.file} class="gw-pipeline-row">
          <AgentIcon status={file.status} />
          <CodeRef path={file.file} />
          {file.status === 'done' && <Badge label={String(file.findings_count)} tone={file.findings_count > 0 ? 'warning' : 'success'} />}
          {file.error !== null && file.error !== '' && <div class="gw-pipeline-error">{file.error}</div>}
        </div>
      ))}
    </section>
  );
}

function ReviewersSection({ status }: { readonly status: ReviewPipelineStatus }): JSX.Element {
  const t = useT();
  const reviewers = Object.entries(status.integration);
  const hasAdjudication = status.adjudication !== 'skipped';
  return (
    <>
      {reviewers.length > 0 && (
        <section class="gw-pipeline-section">
          <h4 class="gw-pipeline-heading">{t('reviewPipeline.integrationSection')}</h4>
          {reviewers.map(([name, agentStatus]) => <AgentRow key={name} name={name} status={agentStatus} error={status.integration_errors[name]} />)}
        </section>
      )}
      {hasAdjudication && (
        <section class="gw-pipeline-section">
          <h4 class="gw-pipeline-heading">{t('reviewPipeline.adjudicationSection')}</h4>
          <AgentRow name={t('reviewPipeline.adjudicationLabel')} status={status.adjudication} error={status.adjudication_error} />
        </section>
      )}
    </>
  );
}

function StatusBody({ status }: { readonly status: ReviewPipelineStatus }): JSX.Element {
  const t = useT();
  const elapsed = elapsedSeconds(status.started_at, status.finished_at, Date.now() / 1000);
  return (
    <div class="gw-pipeline">
      <div class="gw-pipeline-state">
        <Badge label={t(`reviewPipeline.state.${status.state}`)} tone={stateTone(status.state)} />
        {elapsed !== undefined && <span class="gw-muted">{t('reviewPipeline.elapsed', { seconds: elapsed })}</span>}
      </div>
      {status.error !== null && status.error !== '' && <div class="gw-pipeline-error">{status.error}</div>}
      <FilesSection status={status} />
      <ReviewersSection status={status} />
    </div>
  );
}

function useStartPipeline(workspaceId: number, phase: string): () => Promise<void> {
  const t = useT();
  const dialogs = useDialogs();
  const start = useMutation((force: boolean) => startReviewPipeline(workspaceId, force ? { force: true } : {}), { invalidates: ['reviewPipeline'] });
  return async () => {
    const isStartPhase = phase === REVIEW_START_PHASE;
    const message = isStartPhase ? t('reviewPipeline.runConfirm') : t('vsc.phase.forceConfirm', { phase });
    if (await dialogs.confirm({ title: t('reviewPipeline.runButton'), message, danger: !isStartPhase })) {
      if ((await start.run(!isStartPhase)) !== undefined) {
        toasts.success(t('reviewPipeline.runStarted'));
      }
    }
  };
}

function useNotRunText(phase: string): string {
  const t = useT();
  const sequence = useStore((s) => s.state?.phase_sequence ?? NO_PHASES);
  return isBeforeReviewStart(sequence, phase) ? t('vsc.phase.pipelineRunsAt', { phase: REVIEW_START_PHASE }) : t('vsc.phase.pipelineNotRun');
}

export function ReviewPipelineCard({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const { workspace_id: workspaceId, phase } = useWorkspaceState();
  const pipeline = useResource('reviewPipeline', `pipeline:${workspaceId}`, () => loadPipeline(workspaceId), { active });
  const isRunning = isPipelineActive(pipeline.data?.status);
  const startPipeline = useStartPipeline(workspaceId, phase);
  useEffect(() => {
    if (!active || !isRunning) {
      return undefined;
    }
    const timer = setInterval(pipeline.reload, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, isRunning, pipeline.reload]);
  const canStart = canStartPipeline(pipeline.data?.status);
  const notRunText = useNotRunText(phase);
  const runButton = <Button size="sm" icon="play" label={t('reviewPipeline.runButton')} disabled={!canStart} onClick={startPipeline} />;
  if (pipeline.data !== undefined && pipeline.data.status === undefined) {
    return <EmptySectionLine id="review-pipeline" text={notRunText} action={runButton} />;
  }
  return (
    <Card id="review-pipeline" title={t('cards.reviewPipeline')} actions={runButton}>
      <ResourceView resource={pipeline}>
        {(view) => (view.status === undefined ? null : <StatusBody status={view.status} />)}
      </ResourceView>
    </Card>
  );
}
