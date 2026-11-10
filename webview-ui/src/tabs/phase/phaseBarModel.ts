export type SegmentState = 'done' | 'current' | 'upcoming';

export interface PhaseBarSegment {
  readonly key: string;
  readonly phases: readonly string[];
  readonly title: string;
  readonly caption: string;
  readonly state: SegmentState;
  readonly isGate: boolean;
  readonly hasUserGate: boolean;
  readonly weight: number;
}

const EXECUTION_STEP_PATTERN = /^3\.(\d+)\.\d+$/;
// Mirrors the web's USER_GATES (state.js): phases that stop for a human decision.
const USER_GATE_PHASES: ReadonlySet<string> = new Set(['1.4', '2.1', '4.2']);
const COMMIT_APPROVAL_PATTERN = /^3\.\d+\.3$/;

export function isUserGate(phase: string): boolean {
  return USER_GATE_PHASES.has(phase) || COMMIT_APPROVAL_PATTERN.test(phase);
}
const GROUP_WEIGHT_PER_PHASE = 0.6;

interface DraftSegment {
  readonly key: string;
  readonly phases: string[];
  readonly groupId?: string;
}

function groupPhases(sequence: readonly string[]): DraftSegment[] {
  const drafts: DraftSegment[] = [];
  const groupIndex = new Map<string, DraftSegment>();
  for (const phase of sequence) {
    const step = EXECUTION_STEP_PATTERN.exec(phase);
    if (step === null) {
      drafts.push({ key: phase, phases: [phase] });
      continue;
    }
    const groupId = `3.${step[1]}`;
    const existing = groupIndex.get(groupId);
    if (existing === undefined) {
      const created: DraftSegment = { key: groupId, phases: [phase], groupId };
      groupIndex.set(groupId, created);
      drafts.push(created);
    } else {
      existing.phases.push(phase);
    }
  }
  return drafts;
}

function segmentState(sequence: readonly string[], phases: readonly string[], currentPhase: string): SegmentState {
  if (phases.includes(currentPhase)) {
    return 'current';
  }
  const currentIndex = sequence.indexOf(currentPhase);
  const lastIndex = sequence.indexOf(phases[phases.length - 1]);
  return currentIndex >= 0 && lastIndex < currentIndex ? 'done' : 'upcoming';
}

export function buildPhaseBar(
  sequence: readonly string[],
  currentPhase: string,
  gatePhase: string | undefined,
  labelOf: (phase: string) => string,
): PhaseBarSegment[] {
  return groupPhases(sequence).map((draft) => {
    const isGroup = draft.groupId !== undefined;
    const title = labelOf(draft.key);
    const state = segmentState(sequence, draft.phases, currentPhase);
    return {
      key: draft.key,
      phases: draft.phases,
      title,
      caption: isGroup ? groupCaption(draft.key, title, state === 'current') : title,
      state,
      isGate: gatePhase !== undefined && draft.phases.includes(gatePhase),
      hasUserGate: draft.phases.some(isUserGate),
      weight: isGroup ? Math.max(1, draft.phases.length * GROUP_WEIGHT_PER_PHASE) : 1,
    };
  });
}

// Sub-phase groups are captioned by id to keep the bar short, except the current one, which also names its sub-phase.
function groupCaption(groupId: string, name: string, isCurrent: boolean): string {
  return isCurrent && name !== groupId ? `${groupId} ${name}` : groupId;
}

export interface CaptionParts {
  readonly lead: string;
  readonly rest: string;
}

// The gate lock stays glued to the first word, so it never takes a caption line of its own.
export function splitCaption(caption: string): CaptionParts {
  const trimmed = caption.trim();
  const breakAt = trimmed.search(/\s/);
  return breakAt < 0 ? { lead: trimmed, rest: '' } : { lead: trimmed.slice(0, breakAt), rest: trimmed.slice(breakAt).trim() };
}
