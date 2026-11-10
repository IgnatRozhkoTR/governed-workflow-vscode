import type { Criterion, PlanSubPhase } from '@api-types';
import { shouldCollapseSubPhase } from '../../../webview-ui/src/tabs/planning/subPhaseModel';
import { describe, expect, it } from 'vitest';
import { buildDetailsJson, criterionTypeKey, readCriterionDetails, splitNames } from '../../../webview-ui/src/tabs/planning/criteriaModel';
import {
  addScopeEntry, mergeScopes, removeScopeEntry, replaceScopeEntry, scopeCommentTarget, scopeEntries, sortedScopeKeys,
} from '../../../webview-ui/src/tabs/planning/scopeModel';
import { normalizeSystemDiagrams, prepareDiagramSource } from '../../../webview-ui/src/tabs/planning/systemDiagram';
import { hasDetails, isCurrentProgressKey, normalizeDetails, orderProgressKeys } from '../../../webview-ui/src/tabs/progress/progressModel';

const SCOPE = { '3.2': { must: ['b.ts'], may: ['m.ts'] }, '3.1': { must: ['a.ts', 'c.ts'] } };

describe('scopeModel', () => {
  it('sorts keys and merges must and may across phases', () => {
    expect(sortedScopeKeys(SCOPE)).toEqual(['3.1', '3.2']);
    expect(mergeScopes(SCOPE)).toEqual({ must: ['b.ts', 'a.ts', 'c.ts'], may: ['m.ts'] });
  });

  it('reads entries for the all tab and for one phase', () => {
    expect(scopeEntries(SCOPE, 'all', 'must')).toHaveLength(3);
    expect(scopeEntries(SCOPE, '3.1', 'may')).toEqual([]);
    expect(scopeEntries(SCOPE, 'missing', 'must')).toEqual([]);
  });

  it('adds, replaces and removes entries without mutating the input', () => {
    const added = addScopeEntry(SCOPE, '3.1', 'may', 'x/**');
    expect(added['3.1']).toEqual({ must: ['a.ts', 'c.ts'], may: ['x/**'] });
    expect(SCOPE['3.1']).toEqual({ must: ['a.ts', 'c.ts'] });
    expect(replaceScopeEntry(SCOPE, '3.1', 'must', 1, 'd.ts')['3.1']?.must).toEqual(['a.ts', 'd.ts']);
    expect(removeScopeEntry(SCOPE, '3.1', 'must', 0)['3.1']?.must).toEqual(['c.ts']);
    expect(addScopeEntry({}, '3.3', 'must', 'n.ts')['3.3']).toEqual({ must: ['n.ts'], may: [] });
  });

  it('builds the web comment target', () => {
    expect(scopeCommentTarget('must', 'src/a.ts')).toBe('must: src/a.ts');
  });
});

describe('systemDiagram', () => {
  it('normalizes string, array and invalid input', () => {
    expect(normalizeSystemDiagrams(undefined).format).toBe('empty');
    expect(normalizeSystemDiagrams([]).format).toBe('empty');
    expect(normalizeSystemDiagrams({}).format).toBe('invalid');
    expect(normalizeSystemDiagrams('graph TD\nA-->B').entries).toEqual([{ title: '', source: 'graph TD\nA-->B' }]);
    const result = normalizeSystemDiagrams([{ title: 'One', diagram: 'graph TD' }, { title: 'Blank', diagram: '  ' }]);
    expect(result.entries).toEqual([{ title: 'One', source: 'graph TD' }]);
  });

  it('strips init directives, recolours rects and fixes literal newlines', () => {
    const source = "%%{init: {'theme':'base'}}%%\nsequenceDiagram\nrect rgb(1,2,3)\nrect #fff\nA->>B: one\\ntwo";
    const dark = prepareDiagramSource(source, false);
    expect(dark).not.toContain('%%{init');
    expect(dark).toContain('rect rgba(40, 40, 60, 0.5)');
    expect(dark).toContain('rect rgba(40, 60, 40, 0.5)');
    expect(dark).toContain('one<br/>two');
    expect(prepareDiagramSource('rect #fff', true)).toBe('rect rgba(200, 210, 230, 0.3)');
  });
});

describe('criteriaModel', () => {
  it('packs test details like the web', () => {
    const draft = { type: 'unit_test', description: 'd', file: ' T.java ', names: 'a, b,, c' };
    expect(JSON.parse(buildDetailsJson(draft) ?? '')).toEqual({ file: 'T.java', test_names: ['a', 'b', 'c'] });
    expect(JSON.parse(buildDetailsJson({ ...draft, type: 'bdd_scenario' }) ?? '')).toEqual({ file: 'T.java', scenario_names: ['a', 'b', 'c'] });
  });

  it('packs custom criteria as an instruction and omits empty details', () => {
    expect(JSON.parse(buildDetailsJson({ type: 'custom', description: ' check it ', file: 'x', names: 'y' }) ?? '')).toEqual({ instruction: 'check it' });
    expect(buildDetailsJson({ type: 'unit_test', description: 'd', file: '', names: '' })).toBeUndefined();
  });

  it('maps type labels and splits names', () => {
    expect(criterionTypeKey('bdd_scenario')).toBe('criteria.bddScenario');
    expect(criterionTypeKey('other')).toBe('criteria.other');
    expect(splitNames(' a , ,b')).toEqual(['a', 'b']);
  });

  it('reads details and reports none when empty', () => {
    const base = { id: 1, type: 'bdd_scenario', description: '', source: null, status: 'accepted', validated: null, validation_message: null };
    const withDetails = readCriterionDetails({ ...base, details: { file: 'f', scenario_names: ['s'] } } as Criterion);
    expect(withDetails).toMatchObject({ file: 'f', names: ['s'], isScenario: true });
    expect(readCriterionDetails({ ...base, details: {} } as Criterion)).toBeUndefined();
    expect(readCriterionDetails({ ...base, details: null } as Criterion)).toBeUndefined();
  });
});

describe('progressModel', () => {
  const entry = { summary: '', created_at: '', updated_at: '' };

  it('orders by phase sequence with unknown keys last', () => {
    const progress = { zzz: entry, '2.0': entry, '1.0': entry };
    expect(orderProgressKeys(progress, ['1.0', '2.0'])).toEqual(['1.0', '2.0', 'zzz']);
  });

  it('detects the current key by prefix', () => {
    expect(isCurrentProgressKey('3.1', '3.1.2')).toBe(true);
    expect(isCurrentProgressKey('3.1', '3.10')).toBe(false);
    expect(isCurrentProgressKey('3.1', '3.1')).toBe(true);
  });

  it('parses JSON strings into structures and keeps prose', () => {
    expect(normalizeDetails('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(normalizeDetails('{broken')).toBe('{broken');
    expect(normalizeDetails('plain')).toBe('plain');
  });

  it('reports whether details have content', () => {
    expect(hasDetails(null)).toBe(false);
    expect(hasDetails([])).toBe(false);
    expect(hasDetails({})).toBe(false);
    expect(hasDetails({ a: 1 })).toBe(true);
    expect(hasDetails('x')).toBe(true);
  });
});

describe('shouldCollapseSubPhase', () => {
  const items = [{ id: '3.1' }, { id: '3.2' }] as PlanSubPhase[];

  it('shouldCollapseSubPhase_shouldCollapseOthers_whenOneIsCurrent', () => {
    expect(shouldCollapseSubPhase('3.2.1', items, items[0])).toBe(true);
    expect(shouldCollapseSubPhase('3.2.1', items, items[1])).toBe(false);
  });

  it('shouldCollapseSubPhase_shouldKeepAllOpen_whenNoneIsCurrent', () => {
    expect(shouldCollapseSubPhase('2.0', items, items[0])).toBe(false);
  });
});
