import type { PhaseTransition } from '@api-types';
import { isCodeReviewGate, isFinalApprovalGate } from '@shared/navigation';

const USER_GATE_PHASES: ReadonlySet<string> = new Set(['1.4', '2.0', '2.1']);
const MIN_COLLAPSED_RUN = 2;
const SUB_PHASE_FIXES_PATTERN = /^(\d+\.\d+)\.2$/;

export interface IndexedTransition {
  readonly entry: PhaseTransition;
  readonly index: number;
}

export type HistoryItem =
  | { readonly kind: 'entry'; readonly item: IndexedTransition }
  | { readonly kind: 'run'; readonly items: readonly IndexedTransition[] };

function phaseParts(phase: string): number[] {
  return phase.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function isBackwardMove(from: string, to: string): boolean {
  const fromParts = phaseParts(from);
  const toParts = phaseParts(to);
  for (let position = 0; position < Math.max(fromParts.length, toParts.length); position += 1) {
    const difference = (toParts[position] ?? 0) - (fromParts[position] ?? 0);
    if (difference !== 0) {
      return difference < 0;
    }
  }
  return false;
}

function isUserGate(phase: string): boolean {
  return USER_GATE_PHASES.has(phase) || isCodeReviewGate(phase) || isFinalApprovalGate(phase);
}

// The agent's own loop: after fixing, a sub-phase goes back to validation (3.2.2 Fixes → 3.2.1 Validation) on its own.
export function isAgentFixLoop(from: string, to: string): boolean {
  const fixes = SUB_PHASE_FIXES_PATTERN.exec(from);
  return fixes !== null && to === `${fixes[1]}.1`;
}

// Prominent are the moves the user made or answered: gate decisions, rejections with notes, and backward moves that
// are not the agent's own fix loop.
export function isProminentTransition(entry: PhaseTransition, hasNotes: boolean): boolean {
  const isUserBackwardMove = isBackwardMove(entry.from, entry.to) && !isAgentFixLoop(entry.from, entry.to);
  return hasNotes || isUserGate(entry.from) || isUserBackwardMove;
}

function appendRoutine(items: HistoryItem[], routine: IndexedTransition[]): void {
  if (routine.length >= MIN_COLLAPSED_RUN) {
    items.push({ kind: 'run', items: [...routine] });
  } else {
    routine.forEach((item) => items.push({ kind: 'entry', item }));
  }
  routine.length = 0;
}

export function groupHistory(history: readonly PhaseTransition[], indicesWithNotes: ReadonlySet<number>): HistoryItem[] {
  const items: HistoryItem[] = [];
  const routine: IndexedTransition[] = [];
  [...history.keys()].reverse().forEach((index) => {
    const item = { entry: history[index], index };
    if (isProminentTransition(item.entry, indicesWithNotes.has(index))) {
      appendRoutine(items, routine);
      items.push({ kind: 'entry', item });
    } else {
      routine.push(item);
    }
  });
  appendRoutine(items, routine);
  return items;
}
