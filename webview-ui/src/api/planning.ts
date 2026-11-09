import type { Criterion, PhaseScope } from '@api-types';
import { apiDelete, apiGet, apiPost, apiPut, ws } from './request';

export interface CriteriaQuery {
  readonly status?: string;
  readonly type?: string;
}

export interface NewCriterion {
  readonly type: string;
  readonly description: string;
  readonly details_json?: string;
}

export function setScope(scope: Record<string, PhaseScope>): Promise<unknown> {
  return apiPut(ws('scope'), { scope });
}

export function listCriteria(q?: CriteriaQuery): Promise<{ criteria: Criterion[] }> {
  return apiGet<{ criteria: Criterion[] }>(ws('criteria'), { status: q?.status, type: q?.type });
}

export function addCriterion(c: NewCriterion): Promise<unknown> {
  return apiPost(ws('criteria'), c);
}

export function deleteCriterion(id: number): Promise<unknown> {
  return apiDelete(ws(`criteria/${id}`));
}

export function validateCriterion(id: number, passed: boolean, message?: string): Promise<unknown> {
  return apiPut(ws(`criteria/${id}/validate`), message === undefined ? { passed } : { passed, message });
}
