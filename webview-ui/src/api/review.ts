import { apiPost } from './request';

export type ReviewResolution = 'fixed' | 'out_of_scope' | 'false_positive';

export function resolveAllReview(workspaceId: number, resolution: ReviewResolution): Promise<{ resolved_count: number }> {
  return apiPost<{ resolved_count: number }>(`/api/workspaces/${encodeURIComponent(String(workspaceId))}/review-issues/resolve-all`, { resolution });
}
