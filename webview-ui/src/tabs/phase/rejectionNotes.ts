import type { PhaseTransition, ReviewComment } from '@api-types';

// The server stores a gate's "Send back" feedback as a phase comment targeting "reject:<gate phase>".
const PHASE_SCOPE = 'phase';
const REJECTION_TARGET_PREFIX = 'reject:';

export interface PlacedRejectionNotes {
  // Keyed by the index of the transition in history order.
  readonly byTransition: ReadonlyMap<number, readonly ReviewComment[]>;
  // Notes whose gate never appears as a history row; they still count, so they need a place too.
  readonly unplaced: readonly ReviewComment[];
}

export function rejectionNotes(commentsByTarget: Readonly<Record<string, readonly ReviewComment[]>>): ReviewComment[] {
  return Object.values(commentsByTarget).flat().filter((comment) => (
    comment.scope === PHASE_SCOPE && comment.parent_id === null && (comment.target ?? '').startsWith(REJECTION_TARGET_PREFIX)
  ));
}

function gatePhaseOf(note: ReviewComment): string {
  return (note.target ?? '').slice(REJECTION_TARGET_PREFIX.length);
}

function timeOf(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

// The note is written right after the move it explains, so it belongs to the latest move out of its gate made before it;
// without a timed match it falls back to the latest move out of that gate.
function transitionIndexFor(history: readonly PhaseTransition[], note: ReviewComment): number | undefined {
  const gate = gatePhaseOf(note);
  const fromGate = history.flatMap((entry, index) => (entry.from === gate ? [index] : []));
  const before = fromGate.filter((index) => timeOf(history[index].time) <= timeOf(note.created_at));
  return before.at(-1) ?? fromGate.at(-1);
}

export function placeRejectionNotes(history: readonly PhaseTransition[], notes: readonly ReviewComment[]): PlacedRejectionNotes {
  const byTransition = new Map<number, ReviewComment[]>();
  const unplaced: ReviewComment[] = [];
  for (const note of notes) {
    const index = transitionIndexFor(history, note);
    if (index === undefined) {
      unplaced.push(note);
    } else {
      byTransition.set(index, [...(byTransition.get(index) ?? []), note]);
    }
  }
  return { byTransition, unplaced };
}
