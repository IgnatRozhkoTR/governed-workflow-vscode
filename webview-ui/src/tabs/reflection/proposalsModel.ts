import type { Proposal, ProposalStatus } from '../../api/reflection';
import type { Tone } from '../../components/types';

export const PENDING_STATUS: ProposalStatus = 'proposed';

const STATUS_TONES: Readonly<Record<string, Tone>> = { proposed: 'warning', executed: 'success', failed: 'danger', rejected: 'neutral' };
const EMPTY_PAYLOAD = '{}';
const PREVIEW_LINE_LIMIT = 6;
const PREVIEW_CHAR_LIMIT = 480;

export function isPending(proposal: Proposal): boolean {
  return proposal.status === PENDING_STATUS;
}

// A long body would bury the proposals below it, so it opens as a few-line preview.
export function isLongProposalBody(body: string): boolean {
  const lineCount = body.split('\n').filter((line) => line.trim() !== '').length;
  return lineCount > PREVIEW_LINE_LIMIT || body.length > PREVIEW_CHAR_LIMIT;
}

export function countPending(proposals: readonly Proposal[]): number {
  return proposals.filter(isPending).length;
}

export interface ProposalProgress {
  readonly handled: number;
  readonly total: number;
}

export function proposalProgress(proposals: readonly Proposal[]): ProposalProgress {
  return { handled: proposals.length - countPending(proposals), total: proposals.length };
}

export function isEveryProposalHandled(progress: ProposalProgress): boolean {
  return progress.total > 0 && progress.handled === progress.total;
}

export function visibleProposals(proposals: readonly Proposal[], showResolved: boolean): Proposal[] {
  return showResolved ? [...proposals] : proposals.filter(isPending);
}

export function countHiddenResolved(proposals: readonly Proposal[], showResolved: boolean): number {
  return showResolved ? 0 : proposals.length - countPending(proposals);
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

export type ApplyPreview =
  | { readonly kind: 'payload'; readonly value: unknown }
  | { readonly kind: 'body'; readonly source: string }
  | { readonly kind: 'none' };

// Resolving only records the status on the server, so the user confirms against what the proposal itself says it changes:
// its structured payload when it has one, its description otherwise.
export function applyPreview(proposal: Proposal): ApplyPreview {
  const payload = parseJsonText(proposal.payload_json);
  if (payload !== undefined) {
    return { kind: 'payload', value: payload };
  }
  const body = proposal.body?.trim() ?? '';
  return body === '' ? { kind: 'none' } : { kind: 'body', source: body };
}
