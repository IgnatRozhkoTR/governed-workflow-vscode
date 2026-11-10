import type { Tone } from '../../components/types';
import type { FindingsTally } from '../../shell/gateDigestModel';

const FIXES_PHASE = '4.1';
const VERIFICATION_TONES: Readonly<Record<string, Tone>> = { passed: 'success', failed: 'danger', error: 'danger', running: 'info', skipped: 'neutral' };
const NEUTRAL_TONE: Tone = 'neutral';
const WARNING_TONE: Tone = 'warning';

export function isFixesPhase(phase: string): boolean {
  return phase === FIXES_PHASE;
}

export function verificationTone(status: string | undefined): Tone {
  return status === undefined ? NEUTRAL_TONE : (VERIFICATION_TONES[status] ?? WARNING_TONE);
}

export function findingsToAddress(tally: FindingsTally): number {
  return tally.open;
}

export function findingsTone(openCount: number): Tone {
  return openCount > 0 ? WARNING_TONE : 'success';
}
