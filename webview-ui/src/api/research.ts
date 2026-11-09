import { apiDelete, apiPost, ws } from './request';

export function proveResearch(id: number, proven: boolean): Promise<unknown> {
  return apiPost(ws(`research/${id}/prove`), { proven });
}

export function deleteResearch(id: number): Promise<unknown> {
  return apiDelete(ws(`research/${id}`));
}
