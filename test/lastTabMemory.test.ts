import { describe, expect, it } from 'vitest';
import { DEFAULT_NAV } from '../src/shared/navigation';
import { LastTabMemory } from '../src/webview/lastTabMemory';
import { memoryMemento } from './support/fixtures';

const SHOP = { projectId: 'shop', branch: 'feature/a' };
const OTHER = { projectId: 'shop', branch: 'feature/b' };
const GATE_NAV = { tab: 'phase', anchor: 'phase-progression' } as const;

describe('LastTabMemory', () => {
  it('initialNav_shouldReturnProgress_whenWorkspaceWasNeverVisitedAndNothingWaits', () => {
    expect(new LastTabMemory(memoryMemento()).initialNav(SHOP, undefined)).toEqual(DEFAULT_NAV);
    expect(DEFAULT_NAV).toEqual({ tab: 'progress' });
  });

  it('initialNav_shouldReturnProgress_whenNoWorkspaceIsSelected', () => {
    expect(new LastTabMemory(memoryMemento()).initialNav(undefined, undefined)).toEqual(DEFAULT_NAV);
  });

  it('initialNav_shouldReturnRememberedTab_forThatWorkspaceOnly', async () => {
    const memory = new LastTabMemory(memoryMemento());

    await memory.remember(SHOP, 'planning');

    expect(memory.initialNav(SHOP, undefined)).toEqual({ tab: 'planning' });
    expect(memory.initialNav(OTHER, undefined)).toEqual(DEFAULT_NAV);
  });

  it('initialNav_shouldReturnProgress_whenStoredValueIsNotATab', () => {
    const memory = new LastTabMemory(memoryMemento({ 'governedWorkflow.lastTab:shop/feature/a': 'dashboard' }));

    expect(memory.initialNav(SHOP, undefined)).toEqual(DEFAULT_NAV);
  });

  it('initialNav_shouldLandOnAttentionTarget_whenNeverVisited', () => {
    expect(new LastTabMemory(memoryMemento()).initialNav(SHOP, GATE_NAV)).toEqual(GATE_NAV);
  });

  it('initialNav_shouldPreferRememberedTab_whenSomethingNeedsAttention', async () => {
    const memory = new LastTabMemory(memoryMemento());

    await memory.remember(SHOP, 'changes');

    expect(memory.initialNav(SHOP, GATE_NAV)).toEqual({ tab: 'changes' });
  });

  it('rememberedTab_shouldBeUndefined_whenWorkspaceWasNeverVisited', async () => {
    const memory = new LastTabMemory(memoryMemento());

    await memory.remember(OTHER, 'review');

    expect(memory.rememberedTab(SHOP)).toBeUndefined();
    expect(memory.rememberedTab(OTHER)).toBe('review');
  });
});
