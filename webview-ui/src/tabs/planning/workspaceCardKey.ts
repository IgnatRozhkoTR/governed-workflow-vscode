import { useStore } from '../../store/hooks';

// Each workspace has its own plan, so whether its diagrams are open is remembered per workspace, not panel-wide.
// Cards also take this as their `key`, so switching workspaces remounts them with that workspace's remembered state.
export function useWorkspaceCardKey(cardId: string): string {
  const workspace = useStore((s) => s.workspace);
  return workspace === null ? `card.${cardId}` : `card.${cardId}:${workspace.projectId}/${workspace.branch}`;
}
