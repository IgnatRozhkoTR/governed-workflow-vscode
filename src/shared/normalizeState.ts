import type { WorkspaceState } from '../api/types';

export function normalizeWorkspaceState(state: WorkspaceState): WorkspaceState {
  return { ...state, pending_gate: state.pending_gate ?? null };
}
