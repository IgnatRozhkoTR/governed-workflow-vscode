export type SegmentState = 'done' | 'current' | 'upcoming';

export interface PhaseBarSegment {
  readonly key: string;
  readonly phases: readonly string[];
  readonly title: string;
  readonly caption: string;
  readonly state: SegmentState;
  readonly isGate: boolean;
  readonly weight: number;
}

const EXECUTION_STEP_PATTERN = /^3\.(\d+)\.\d+$/;
const GROUP_WEIGHT_PER_PHASE = 0.6;
const CAPTION_MAX_LENGTH = 12;

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

function shorten(text: string): string {
  return text.length > CAPTION_MAX_LENGTH ? `${text.slice(0, CAPTION_MAX_LENGTH - 1)}…` : text;
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
    return {
      key: draft.key,
      phases: draft.phases,
      title,
      caption: isGroup ? draft.key : shorten(title),
      state: segmentState(sequence, draft.phases, currentPhase),
      isGate: gatePhase !== undefined && draft.phases.includes(gatePhase),
      weight: isGroup ? Math.max(1, draft.phases.length * GROUP_WEIGHT_PER_PHASE) : 1,
    };
  });
}
