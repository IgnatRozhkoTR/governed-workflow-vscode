import type * as vscode from 'vscode';
import type { WorkspaceRef } from '../api/types';
import { isNavTarget, type NavTarget } from '../shared/navigation';
import { isWorkspaceRef } from './windowSelectionMemory';
import { normalizeFsPath } from './worktreePaths';

const HANDOFF_KEY = 'governedWorkflow.worktreeHandoff';
export const HANDOFF_TTL_MS = 5 * 60 * 1000;

export interface HandedOff {
  readonly ref: WorkspaceRef;
  readonly nav?: NavTarget;
}

export interface HandoffEntry extends HandedOff {
  readonly offeredAt: number;
}

export type HandoffEntries = Readonly<Record<string, HandoffEntry>>;

export interface HandoffTake {
  readonly handedOff: HandedOff | undefined;
  readonly remaining: HandoffEntries;
}

// The window that opens a worktree folder is a different extension host; globalState is the only channel it shares with this one.
export class WorktreeHandoff {
  constructor(private readonly globalState: vscode.Memento) {}

  offer(folderPath: string, ref: WorkspaceRef, nav?: NavTarget, now = Date.now()): Thenable<void> {
    return this.globalState.update(HANDOFF_KEY, withOffer(this.entries(), normalizeFsPath(folderPath), { ref, nav }, now));
  }

  async take(folderPaths: readonly string[], now = Date.now()): Promise<HandedOff | undefined> {
    const entries = this.entries();
    if (Object.keys(entries).length === 0) {
      return undefined;
    }
    const taken = takeFrom(entries, folderPaths.map((folder) => normalizeFsPath(folder)), now);
    await this.globalState.update(HANDOFF_KEY, taken.remaining);
    return taken.handedOff;
  }

  private entries(): HandoffEntries {
    const stored = this.globalState.get<unknown>(HANDOFF_KEY);
    return typeof stored === 'object' && stored !== null ? validEntries(stored as Record<string, unknown>) : {};
  }
}

export function withOffer(entries: HandoffEntries, normalizedPath: string, offer: HandedOff, now: number): HandoffEntries {
  const entry: HandoffEntry = offer.nav === undefined ? { ref: offer.ref, offeredAt: now } : { ref: offer.ref, nav: offer.nav, offeredAt: now };
  return { ...unexpired(entries, now), [normalizedPath]: entry };
}

export function takeFrom(entries: HandoffEntries, normalizedPaths: readonly string[], now: number): HandoffTake {
  const live = unexpired(entries, now);
  const matchedPath = normalizedPaths.find((folderPath) => live[folderPath] !== undefined);
  if (matchedPath === undefined) {
    return { handedOff: undefined, remaining: live };
  }
  const { [matchedPath]: matched, ...remaining } = live;
  const { offeredAt, ...handedOff } = matched;
  return { handedOff, remaining };
}

function unexpired(entries: HandoffEntries, now: number): HandoffEntries {
  return Object.fromEntries(Object.entries(entries).filter(([, entry]) => now - entry.offeredAt <= HANDOFF_TTL_MS));
}

function validEntries(stored: Record<string, unknown>): HandoffEntries {
  return Object.fromEntries(Object.entries(stored).filter(([, entry]) => isHandoffEntry(entry))) as HandoffEntries;
}

function isHandoffEntry(value: unknown): value is HandoffEntry {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return isWorkspaceRef(candidate.ref) && typeof candidate.offeredAt === 'number' && (candidate.nav === undefined || isNavTarget(candidate.nav));
}
