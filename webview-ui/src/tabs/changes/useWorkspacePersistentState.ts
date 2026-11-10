import { useCallback, useState } from 'preact/hooks';
import { getPersisted, setPersisted } from '../../rpc/vscodeApi';
import { useStore } from '../../store/hooks';

// The panel switches between workspaces in place, so a per-workspace choice re-reads its value whenever the workspace changes.
export function useWorkspacePersistentState<T>(key: string, initial: T): [T, (value: T) => void] {
  const workspace = useStore((s) => s.workspace);
  const persistKey = workspace === null ? `ui.${key}` : `ui.${key}:${workspace.projectId}/${workspace.branch}`;
  const [updates, setUpdates] = useState<ReadonlyMap<string, T>>(new Map());
  const update = useCallback((value: T) => {
    setPersisted(persistKey, value);
    setUpdates((previous) => new Map(previous).set(persistKey, value));
  }, [persistKey]);
  const value = updates.has(persistKey) ? (updates.get(persistKey) as T) : (getPersisted<T>(persistKey) ?? initial);
  return [value, update];
}
