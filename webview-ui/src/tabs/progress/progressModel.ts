import type { ProgressEntry } from '@api-types';

export function orderProgressKeys(progress: Readonly<Record<string, ProgressEntry>>, phaseSequence: readonly string[]): string[] {
  const rank = (key: string): number => {
    const index = phaseSequence.indexOf(key);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return Object.keys(progress).sort((left, right) => rank(left) - rank(right));
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
