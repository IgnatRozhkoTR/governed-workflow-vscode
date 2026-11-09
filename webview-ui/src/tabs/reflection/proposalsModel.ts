import type { Proposal, ProposalStatus } from '../../api/reflection';
import type { Tone } from '../../components/types';

export const PENDING_STATUS: ProposalStatus = 'proposed';

const STATUS_TONES: Readonly<Record<string, Tone>> = { proposed: 'warning', executed: 'success', failed: 'danger', rejected: 'neutral' };
const EMPTY_PAYLOAD = '{}';

export function isPending(proposal: Proposal): boolean {
  return proposal.status === PENDING_STATUS;
}

export function countPending(proposals: readonly Proposal[]): number {
  return proposals.filter(isPending).length;
}

export function visibleProposals(proposals: readonly Proposal[], showResolved: boolean): Proposal[] {
  return showResolved ? [...proposals] : proposals.filter(isPending);
}

export function statusTone(status: string): Tone {
  return STATUS_TONES[status] ?? 'neutral';
}

export function parseJsonText(text: string | null): unknown {
  const trimmed = text?.trim() ?? '';
  if (trimmed === '' || trimmed === EMPTY_PAYLOAD) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

export function buildResultJson(note: string): string | undefined {
  const trimmed = note.trim();
  return trimmed === '' ? undefined : JSON.stringify({ result: trimmed });
}
