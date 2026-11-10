export type ApproveLabelKind = 'blocked' | 'ship' | 'server' | 'short';

export interface ApproveLabelInput {
  readonly phase: string;
  readonly serverLabel: string;
  readonly blockingCount: number;
}

const FINAL_APPROVAL_PHASE = '4.2';
const MAX_SERVER_LABEL_LENGTH = 18;

// A blocked Approve says so first, the final gate always says it ships the ticket, and any other gate keeps the
// server's wording while it fits beside Send back.
export function approveLabelKind({ phase, serverLabel, blockingCount }: ApproveLabelInput): ApproveLabelKind {
  if (blockingCount > 0) {
    return 'blocked';
  }
  if (phase === FINAL_APPROVAL_PHASE) {
    return 'ship';
  }
  return serverLabel.length <= MAX_SERVER_LABEL_LENGTH ? 'server' : 'short';
}
