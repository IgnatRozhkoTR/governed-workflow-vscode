import type { AvailablePhase, FileSnippet, GateResult, NewComment, PlanStatus, ReviewComment, SetPhaseResult } from '@api-types';
import type { Locale } from '@shared/protocol';
import { apiDelete, apiGet, apiPost, apiPut, ws } from './request';

export interface CreatedId {
  readonly id: number;
}

export interface CommentListQuery {
  readonly scope?: string;
  readonly resolved?: boolean;
}

export interface NewDiscussion {
  readonly text: string;
  readonly type?: 'general' | 'research' | 'impact' | 'scope';
  readonly scope?: 'research' | 'impact';
  readonly target?: string;
  readonly parent_id?: number;
}

export interface DiscussionPatch {
  readonly status?: 'open' | 'resolved';
  readonly text?: string;
}

export function setYolo(enabled: boolean): Promise<unknown> {
  return apiPut(ws('yolo'), { enabled });
}

export function setLocale(locale: Locale): Promise<unknown> {
  return apiPut(ws('locale'), { locale });
}

export function setPhase(phase: string): Promise<SetPhaseResult> {
  return apiPut<SetPhaseResult>(ws('phase'), { phase });
}

export function setPlanStatus(status: PlanStatus): Promise<unknown> {
  return apiPost(ws('plan-status'), { status });
}

export function approveGate(commitMessage?: string): Promise<GateResult> {
  return apiPost<GateResult>(ws('approve'), commitMessage === undefined ? {} : { commit_message: commitMessage });
}

export function rejectGate(comments: string): Promise<GateResult> {
  return apiPost<GateResult>(ws('reject'), { comments });
}

export function notifyClaude(message: string): Promise<unknown> {
  return apiPost(ws('terminal/notify'), { message });
}

export function addComment(c: NewComment): Promise<CreatedId> {
  return apiPost<CreatedId>(ws('comments'), c);
}

export function listComments(q: CommentListQuery): Promise<{ comments: ReviewComment[] }> {
  return apiGet<{ comments: ReviewComment[] }>(ws('comments'), { scope: q.scope, resolved: q.resolved });
}

export function replyComment(id: number, text: string): Promise<CreatedId> {
  return apiPost<CreatedId>(ws(`comments/${id}/reply`), { text });
}

export function resolveComment(id: number, resolved: boolean): Promise<unknown> {
  return apiPut(ws(`comments/${id}/resolve`), { resolved });
}

export function createDiscussion(d: NewDiscussion): Promise<CreatedId> {
  return apiPost<CreatedId>(ws('context/discussions'), d);
}

export function updateDiscussion(id: number, patch: DiscussionPatch): Promise<unknown> {
  return apiPut(ws(`context/discussions/${id}`), patch);
}

export function deleteDiscussion(id: number): Promise<unknown> {
  return apiDelete(ws(`context/discussions/${id}`));
}

export function replyDiscussion(id: number, text: string): Promise<unknown> {
  return apiPost(ws(`context/discussions/${id}/reply`), { text });
}

export function getFileSnippet(path: string, start?: number, end?: number, absolute?: boolean): Promise<FileSnippet> {
  return apiGet<FileSnippet>(ws('file'), { path, start, end, absolute });
}

export function getAvailablePhases(): Promise<{ phases: AvailablePhase[] }> {
  return apiGet<{ phases: AvailablePhase[] }>('/api/phases/available');
}
