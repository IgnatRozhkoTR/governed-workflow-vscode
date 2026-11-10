import { describe, expect, it } from 'vitest';
import type { WorkspaceState } from '../src/api/types';
import { normalizeWorkspaceState } from '../src/shared/normalizeState';
import { makeState } from './support/fixtures';

describe('normalizeWorkspaceState', () => {
  it('defaults pending_gate to null when an older server omits it', () => {
    const { pending_gate: _omitted, ...legacy } = makeState();
    const state = normalizeWorkspaceState(legacy as unknown as WorkspaceState);
    expect(state.pending_gate).toBeNull();
  });

  it('keeps an existing pending gate', () => {
    const gate = { phase: '4.1', accepts_commit_message: false };
    expect(normalizeWorkspaceState(makeState({ pending_gate: gate })).pending_gate).toEqual(gate);
  });
});
