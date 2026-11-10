import type { ProgressEntry } from '@api-types';

const UNKNOWN_RANK = Number.MAX_SAFE_INTEGER;
const MARKDOWN_DECORATION_PATTERN = /^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/;
const MARKDOWN_LINK_PATTERN = /!?\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_EMPHASIS_PATTERN = /[*_`~]+/g;

export function orderProgressKeys(progress: Readonly<Record<string, ProgressEntry>>, phaseSequence: readonly string[]): string[] {
  const ranks = new Map(Object.keys(progress).map((key) => [key, sequenceRank(key, phaseSequence)]));
  const rankOf = (key: string): number => ranks.get(key) ?? UNKNOWN_RANK;
  return [...ranks.keys()].sort((left, right) => rankOf(left) - rankOf(right) || compareDottedPhases(left, right));
}

export function orderProgressNewestFirst(progress: Readonly<Record<string, ProgressEntry>>, phaseSequence: readonly string[]): string[] {
  return orderProgressKeys(progress, phaseSequence).reverse();
}

function sequenceRank(key: string, phaseSequence: readonly string[]): number {
  const exact = phaseSequence.indexOf(key);
  if (exact !== -1) {
    return exact;
  }
  const firstStep = phaseSequence.findIndex((phase) => phase.startsWith(`${key}.`));
  return firstStep === -1 ? UNKNOWN_RANK : firstStep;
}

function compareDottedPhases(left: string, right: string): number {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const difference = (leftParts[index] ?? -1) - (rightParts[index] ?? -1);
    if (Number.isNaN(difference)) {
      return left.localeCompare(right);
    }
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

export function wasUpdatedAfterCreation(entry: ProgressEntry): boolean {
  return entry.updated_at !== entry.created_at;
}

export function isCurrentProgressKey(key: string, phase: string): boolean {
  return key === phase || phase.startsWith(`${key}.`);
}

export function normalizeDetails(details: unknown): unknown {
  if (typeof details !== 'string') {
    return details;
  }
  const trimmed = details.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return details;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return details;
  }
}

export function hasDetails(details: unknown): boolean {
  if (details === null || details === undefined || details === '') {
    return false;
  }
  if (Array.isArray(details)) {
    return details.length > 0;
  }
  return typeof details !== 'object' || Object.keys(details).length > 0;
}

export function summaryPreview(markdown: string): string {
  const firstLine = markdown.split('\n').find((line) => line.trim() !== '') ?? '';
  return firstLine
    .replace(MARKDOWN_DECORATION_PATTERN, '')
    .replace(MARKDOWN_LINK_PATTERN, '$1')
    .replace(MARKDOWN_EMPHASIS_PATTERN, '')
    .trim();
}
