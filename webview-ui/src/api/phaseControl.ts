import { apiGet, apiPost } from './request';

export type PipelineState = 'queued' | 'filtering' | 'file_stage' | 'integration_stage' | 'adjudication_stage' | 'done' | 'failed';
export type AgentState = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface PipelineFileResult {
  readonly file: string;
  readonly status: AgentState;
  readonly findings_count: number;
  readonly error: string | null;
}

export interface ReviewPipelineStatus {
  readonly workspace_id: number;
  readonly state: PipelineState;
  readonly stages: readonly string[];
  readonly files: Readonly<Record<string, PipelineFileResult>>;
  readonly integration: Readonly<Record<string, AgentState>>;
  readonly integration_errors: Readonly<Record<string, string>>;
  readonly adjudication: AgentState;
  readonly adjudication_error: string | null;
  readonly started_at: number | null;
  readonly finished_at: number | null;
  readonly error: string | null;
}

export interface ReviewPipelineSummary {
  readonly workspace_id: number;
  readonly state: PipelineState;
  readonly files_total: number;
  readonly files_done: number;
  readonly files_failed: number;
  readonly files_in_progress: number;
  readonly files_with_findings: number;
  readonly files_clean: number;
  readonly failed_files: readonly string[];
  readonly integration_done: number;
  readonly integration_failed: number;
  readonly integration_total: number;
  readonly adjudication: AgentState;
  readonly is_complete: boolean;
  readonly is_ok: boolean;
  readonly error: string | null;
}

export interface StartReviewPipelineOptions {
  readonly force?: boolean;
  readonly base_branch?: string;
}

function pipelinePath(workspaceId: number, suffix: string): string {
  return `/api/workspaces/${encodeURIComponent(String(workspaceId))}/${suffix}`;
}

export function getReviewPipelineStatus(workspaceId: number): Promise<ReviewPipelineStatus> {
  return apiGet<ReviewPipelineStatus>(pipelinePath(workspaceId, 'review-pipeline-status'));
}

export function getReviewPipelineSummary(workspaceId: number): Promise<ReviewPipelineSummary> {
  return apiGet<ReviewPipelineSummary>(pipelinePath(workspaceId, 'review-pipeline/summary'));
}

export function startReviewPipeline(workspaceId: number, opts: StartReviewPipelineOptions): Promise<unknown> {
  return apiPost(pipelinePath(workspaceId, 'review-pipeline/start'), opts);
}
