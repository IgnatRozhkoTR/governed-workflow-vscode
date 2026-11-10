import type { AgentState, PipelineFileResult, PipelineState, ReviewPipelineStatus } from '../../api/phaseControl';
import type { Tone } from '../../components/types';

export const POLL_INTERVAL_MS = 2000;
export const REVIEW_START_PHASE = '4.0';

const ACTIVE_STATES: ReadonlySet<PipelineState> = new Set(['queued', 'filtering', 'file_stage', 'integration_stage', 'adjudication_stage']);
const STATE_TONES: Readonly<Record<PipelineState, Tone>> = {
  queued: 'neutral',
  filtering: 'info',
  file_stage: 'info',
  integration_stage: 'accent',
  adjudication_stage: 'accent',
  done: 'success',
  failed: 'danger',
};
const AGENT_ICONS: Readonly<Record<AgentState, string>> = {
  done: 'check',
  failed: 'close',
  running: 'loading',
  pending: 'circle-outline',
  skipped: 'circle-slash',
};

export interface FilesProgress {
  readonly done: number;
  readonly total: number;
}

export function isPipelineActive(status: ReviewPipelineStatus | undefined): boolean {
  return status !== undefined && ACTIVE_STATES.has(status.state);
}

export function canStartPipeline(status: ReviewPipelineStatus | undefined): boolean {
  return status === undefined || status.state === 'done' || status.state === 'failed';
}

export function stateTone(state: PipelineState): Tone {
  return STATE_TONES[state] ?? 'neutral';
}

export function agentIcon(status: AgentState): string {
  return AGENT_ICONS[status] ?? AGENT_ICONS.pending;
}

export function elapsedSeconds(startedAt: number | null, finishedAt: number | null, nowSeconds: number): number | undefined {
  if (startedAt === null) {
    return undefined;
  }
  return Math.max(0, Math.round((finishedAt ?? nowSeconds) - startedAt));
}

export function filesProgress(files: Readonly<Record<string, PipelineFileResult>>): FilesProgress {
  const entries = Object.values(files);
  const done = entries.filter((file) => file.status === 'done' || file.status === 'failed').length;
  return { done, total: entries.length };
}

// Whether the workspace has yet to reach the phase where the review pipeline starts, by the server's own phase order.
export function isBeforeReviewStart(sequence: readonly string[], phase: string): boolean {
  const currentIndex = sequence.indexOf(phase);
  const startIndex = sequence.indexOf(REVIEW_START_PHASE);
  return currentIndex >= 0 && startIndex >= 0 && currentIndex < startIndex;
}
