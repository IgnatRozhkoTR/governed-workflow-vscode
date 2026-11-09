import type { PhaseScope } from '@api-types';

export type ScopeListKey = 'must' | 'may';
export type ScopeMap = Readonly<Record<string, PhaseScope>>;

export const ALL_SCOPE_TAB = 'all';

export function sortedScopeKeys(scope: ScopeMap): readonly string[] {
  return Object.keys(scope).sort();
}

export function mergeScopes(scope: ScopeMap): { readonly must: readonly string[]; readonly may: readonly string[] } {
  const entries = Object.values(scope);
  return { must: entries.flatMap((entry) => entry.must ?? []), may: entries.flatMap((entry) => entry.may ?? []) };
}

export function scopeEntries(scope: ScopeMap, tab: string, listKey: ScopeListKey): readonly string[] {
  if (tab === ALL_SCOPE_TAB) {
    return mergeScopes(scope)[listKey];
  }
  return scope[tab]?.[listKey] ?? [];
}

export function scopeCommentTarget(listKey: ScopeListKey, path: string): string {
  return `${listKey}: ${path}`;
}

function withList(scope: ScopeMap, phaseKey: string, listKey: ScopeListKey, update: (list: readonly string[]) => string[]): Record<string, PhaseScope> {
  const current = scope[phaseKey] ?? { must: [], may: [] };
  return { ...scope, [phaseKey]: { ...current, must: current.must ?? [], may: current.may ?? [], [listKey]: update(current[listKey] ?? []) } };
}

export function addScopeEntry(scope: ScopeMap, phaseKey: string, listKey: ScopeListKey, path: string): Record<string, PhaseScope> {
  return withList(scope, phaseKey, listKey, (list) => [...list, path]);
}

export function removeScopeEntry(scope: ScopeMap, phaseKey: string, listKey: ScopeListKey, index: number): Record<string, PhaseScope> {
  return withList(scope, phaseKey, listKey, (list) => list.filter((_, position) => position !== index));
}

export function replaceScopeEntry(scope: ScopeMap, phaseKey: string, listKey: ScopeListKey, index: number, path: string): Record<string, PhaseScope> {
  return withList(scope, phaseKey, listKey, (list) => list.map((entry, position) => (position === index ? path : entry)));
}
