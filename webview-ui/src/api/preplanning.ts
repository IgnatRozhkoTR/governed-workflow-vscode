import type { WorkspaceContext } from '@api-types';
import { apiGet, ws } from './request';

export function getContext(): Promise<WorkspaceContext> {
  return apiGet<WorkspaceContext>(ws('context'));
}
