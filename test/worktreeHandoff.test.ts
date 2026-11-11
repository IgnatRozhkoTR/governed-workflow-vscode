import { describe, expect, it } from 'vitest';
import { NEW_WORKSPACE_NAV } from '../src/shared/navigation';
import { WindowSelectionMemory } from '../src/worktree/windowSelectionMemory';
import { HANDOFF_TTL_MS, WorktreeHandoff, takeFrom, withOffer } from '../src/worktree/worktreeHandoff';
import { memoryMemento } from './support/fixtures';

const REF = { projectId: 'shop', branch: 'feature/a' };
const OTHER_REF = { projectId: 'shop', branch: 'feature/b' };
const WORKTREE = '/home/dev/shop/.claude/worktrees/feature-a';
const OTHER_WORKTREE = '/home/dev/shop/.claude/worktrees/feature-b';
const NOW = 1_000_000;

describe('handoff entries', () => {
  it('takeFrom_shouldReturnRefAndRemoveIt_whenFolderWasOffered', () => {
    const entries = withOffer(withOffer({}, WORKTREE, { ref: REF }, NOW), OTHER_WORKTREE, { ref: OTHER_REF }, NOW);

    const taken = takeFrom(entries, [WORKTREE], NOW + 1);

    expect(taken.handedOff).toEqual({ ref: REF });
    expect(Object.keys(taken.remaining)).toEqual([OTHER_WORKTREE]);
  });

  it('takeFrom_shouldIgnoreAndDropExpiredOffers', () => {
    const entries = withOffer({}, WORKTREE, { ref: REF }, NOW);

    const taken = takeFrom(entries, [WORKTREE], NOW + HANDOFF_TTL_MS + 1);

    expect(taken.handedOff).toBeUndefined();
    expect(taken.remaining).toEqual({});
  });

  it('withOffer_shouldReplaceAnEarlierOfferForTheSameFolder', () => {
    const entries = withOffer(withOffer({}, WORKTREE, { ref: REF }, NOW), WORKTREE, { ref: OTHER_REF }, NOW + 1);

    expect(takeFrom(entries, [WORKTREE], NOW + 2).handedOff).toEqual({ ref: OTHER_REF });
  });
});

describe('WorktreeHandoff', () => {
  it('take_shouldConsumeTheOfferOnce_acrossInstancesSharingGlobalState', async () => {
    const globalState = memoryMemento();
    await new WorktreeHandoff(globalState).offer(`${WORKTREE}/`, REF, undefined, NOW);
    const newWindow = new WorktreeHandoff(globalState);

    expect(await newWindow.take(['/tmp/scratch', WORKTREE], NOW + 1)).toEqual({ ref: REF });
    expect(await newWindow.take([WORKTREE], NOW + 2)).toBeUndefined();
  });

  it('take_shouldCarryTheOpenSettingsIntent_acrossInstancesSharingGlobalState', async () => {
    const globalState = memoryMemento();
    await new WorktreeHandoff(globalState).offer(WORKTREE, REF, NEW_WORKSPACE_NAV, NOW);

    expect(await new WorktreeHandoff(globalState).take([WORKTREE], NOW + 1)).toEqual({ ref: REF, nav: NEW_WORKSPACE_NAV });
  });

  it('take_shouldIgnoreEntriesWithMalformedNav', async () => {
    const stored = { [WORKTREE]: { ref: REF, nav: { tab: 'nowhere' }, offeredAt: NOW } };

    expect(await new WorktreeHandoff(memoryMemento({ 'governedWorkflow.worktreeHandoff': stored })).take([WORKTREE], NOW)).toBeUndefined();
  });

  it('take_shouldIgnoreMalformedStoredEntries', async () => {
    const globalState = memoryMemento({ 'governedWorkflow.worktreeHandoff': { [WORKTREE]: { ref: 'broken', offeredAt: NOW } } });

    expect(await new WorktreeHandoff(globalState).take([WORKTREE], NOW)).toBeUndefined();
  });
});

describe('WindowSelectionMemory', () => {
  it('remembered_shouldReturnTheLastRememberedRef', async () => {
    const memory = new WindowSelectionMemory(memoryMemento());

    await memory.remember(REF);

    expect(memory.remembered()).toEqual(REF);
  });

  it('remembered_shouldReturnNothing_whenStoredValueIsMalformed', () => {
    const memory = new WindowSelectionMemory(memoryMemento({ 'governedWorkflow.selectedWorkspace': { projectId: 3 } }));

    expect(memory.remembered()).toBeUndefined();
  });
});
