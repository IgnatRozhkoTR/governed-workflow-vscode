import type { ReviewComment, WorkspaceState } from '@api-types';
import type { NavTarget, Topic } from '@shared/navigation';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { getAvailablePhases } from '../api/core';
import { useToast } from '../components/ToastHost';
import { phaseLabel, type PhaseName } from '../i18n/i18n';
import { getPersisted, setPersisted } from '../rpc/vscodeApi';
import { selectComments, selectOpenCommentCount, store, type StoreSnapshot } from './store';

const UI_PERSIST_PREFIX = 'ui.';
const NO_PHASES: readonly PhaseName[] = [];

export interface Resource<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

export interface ResourceOptions {
  readonly active?: boolean;
  readonly refetchOnState?: boolean;
}

export interface MutationOptions {
  readonly invalidates?: readonly Topic[];
  readonly refreshState?: boolean;
  readonly successToast?: string;
}

export interface Mutation<A extends unknown[], R> {
  run: (...a: A) => Promise<R | undefined>;
  pending: boolean;
}

interface ResourceSlot<T> {
  readonly requestKey: string;
  readonly data: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
}

export function useStore<T>(selector: (s: StoreSnapshot) => T): T {
  const [, setRenderCount] = useState(0);
  const selectorRef = useRef(selector);
  const selectedRef = useRef(selector(store.getSnapshot()));
  selectorRef.current = selector;
  selectedRef.current = selector(store.getSnapshot());
  useEffect(() => store.subscribe(() => {
    if (!Object.is(selectorRef.current(store.getSnapshot()), selectedRef.current)) {
      setRenderCount((count) => count + 1);
    }
  }), []);
  return selectedRef.current;
}

export function useWorkspaceState(): WorkspaceState {
  const state = useStore((s) => s.state);
  if (state === null) {
    throw new Error('useWorkspaceState() is used outside a loaded workspace; App renders tabs only when a state exists.');
  }
  return state;
}

export function useNav(): [NavTarget, (n: NavTarget) => void] {
  const nav = useStore((s) => s.nav);
  return [nav, useCallback((next: NavTarget) => store.navigate(next), [])];
}

export function useResource<T>(topic: Topic, key: string, loader: () => Promise<T>, opts?: ResourceOptions): Resource<T> {
  const isActive = opts?.active ?? true;
  const topicVersion = useStore((s) => s.versions[topic]);
  const stateVersion = useStore((s) => ((opts?.refetchOnState ?? true) ? s.stateVersion : 0));
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((count) => count + 1), []);
  const requestKey = `${key}|${topicVersion}|${stateVersion}|${tick}`;
  const [slot, setSlot] = useState<ResourceSlot<T>>({ requestKey: '', data: undefined, error: undefined, loading: false });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  useEffect(() => {
    if (!isActive || slot.requestKey === requestKey) {
      return undefined;
    }
    return startLoad(loaderRef.current, requestKey, keyOf(slot.requestKey) === key, setSlot);
  }, [isActive, requestKey]);
  return { data: slot.data, error: slot.error, loading: slot.loading || (isActive && slot.requestKey !== requestKey), reload };
}

function startLoad<T>(
  loader: () => Promise<T>,
  requestKey: string,
  keepsData: boolean,
  setSlot: (update: (previous: ResourceSlot<T>) => ResourceSlot<T>) => void,
): () => void {
  let isCurrent = true;
  setSlot((previous) => ({ requestKey, data: keepsData ? previous.data : undefined, error: undefined, loading: true }));
  loader().then(
    (data) => isCurrent && setSlot(() => ({ requestKey, data, error: undefined, loading: false })),
    (error: unknown) => isCurrent && setSlot((previous) => ({ ...previous, error, loading: false })),
  );
  return () => {
    isCurrent = false;
  };
}

function keyOf(requestKey: string): string {
  return requestKey.slice(0, requestKey.indexOf('|'));
}

export function useMutation<A extends unknown[], R>(fn: (...a: A) => Promise<R>, opts?: MutationOptions): Mutation<A, R> {
  const toast = useToast();
  const [pendingCount, setPendingCount] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async (...args: A): Promise<R | undefined> => {
    setPendingCount((count) => count + 1);
    try {
      const result = await fnRef.current(...args);
      await afterMutation(opts);
      if (opts?.successToast !== undefined) {
        toast.success(opts.successToast);
      }
      return result;
    } catch (error) {
      toast.error(error);
      return undefined;
    } finally {
      setPendingCount((count) => count - 1);
    }
  }, [opts?.invalidates, opts?.refreshState, opts?.successToast]);
  return { run, pending: pendingCount > 0 };
}

async function afterMutation(opts: MutationOptions | undefined): Promise<void> {
  if (opts?.invalidates !== undefined && opts.invalidates.length > 0) {
    store.invalidate(...opts.invalidates);
  }
  if (opts?.refreshState === true) {
    await store.refreshState();
  }
}

export function usePersistentState<T>(key: string, initial: T): [T, (v: T) => void] {
  const persistKey = `${UI_PERSIST_PREFIX}${key}`;
  const [value, setValue] = useState<T>(() => getPersisted<T>(persistKey) ?? initial);
  const update = useCallback((next: T) => {
    setValue(next);
    setPersisted(persistKey, next);
  }, [persistKey]);
  return [value, update];
}

export function useAvailablePhases(): readonly PhaseName[] {
  const phases = useResource('phases', 'available', getAvailablePhases, { refetchOnState: false });
  return phases.data?.phases ?? NO_PHASES;
}

export function usePhaseLabel(): (phase: string) => string {
  const available = useAvailablePhases();
  const plan = useStore((s) => s.state?.plan);
  return useCallback((phase: string) => phaseLabel(phase, plan, available), [plan, available]);
}

export function useComments(scope: string, target: string): readonly ReviewComment[] {
  return useStore((s) => selectComments(s, scope, target));
}

export function useOpenCommentCount(scope: string, target: string): number {
  return useStore((s) => selectOpenCommentCount(s, scope, target));
}
