import { apiGet, apiPut, ws } from './request';

export type ProposalStatus = 'proposed' | 'executed' | 'failed' | 'rejected';

export interface Proposal {
  readonly id: number;
  readonly type: string;
  readonly implementation_kind: string;
  readonly status: ProposalStatus;
  readonly title: string;
  readonly body: string | null;
  readonly payload_json: string | null;
  readonly reason: string | null;
  readonly result_json: string | null;
  readonly created_at: string;
  readonly reviewed_at: string | null;
  readonly executed_at: string | null;
}

export interface ProposalQuery {
  readonly status?: string;
  readonly implementation_kind?: string;
}

export function listProposals(q?: ProposalQuery): Promise<{ proposals: Proposal[] }> {
  return apiGet<{ proposals: Proposal[] }>(ws('proposals'), { status: q?.status, implementation_kind: q?.implementation_kind });
}

export function resolveProposal(id: number, status: 'executed' | 'rejected', resultJson?: string): Promise<Proposal> {
  return apiPut<Proposal>(ws(`proposals/${id}/resolve`), { status, result_json: resultJson ?? null });
}
