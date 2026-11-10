// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhaseTransition } from '../../../src/api/types';
import * as core from '../../../webview-ui/src/api/core';
import { store } from '../../../webview-ui/src/store/store';
import { PhaseHistory } from '../../../webview-ui/src/tabs/phase/PhaseHistory';
import { placeRejectionNotes, rejectionNotes } from '../../../webview-ui/src/tabs/phase/rejectionNotes';
import { makeComment, makeState } from '../../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../../webview-ui/src/api/core', () => ({
  replyComment: vi.fn(),
  resolveComment: vi.fn(),
  getAvailablePhases: vi.fn(() => new Promise(() => undefined)),
}));

const HISTORY: PhaseTransition[] = [
  { from: '1.4', to: '1.1', time: '2026-11-01T10:00:00' },
  { from: '1.1', to: '1.4', time: '2026-11-01T11:00:00' },
  { from: '1.4', to: '1.1', time: '2026-11-01T12:00:00' },
];
const FIRST_NOTE = makeComment({ id: 11, scope: 'phase', target: 'reject:1.4', text: 'Research the cache first', created_at: '2026-11-01T10:00:01' });
const SECOND_NOTE = makeComment({ id: 12, scope: 'phase', target: 'reject:1.4', text: 'Still missing the queue', created_at: '2026-11-01T12:00:01' });

function showComments(comments: Record<string, ReturnType<typeof makeComment>[]>): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState({ comments }), etag: null } });
}

beforeEach(() => {
  vi.spyOn(store, 'refreshState').mockResolvedValue(undefined);
  vi.spyOn(store, 'invalidate').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('placeRejectionNotes', () => {
  it('placeRejectionNotes_shouldPutEachNoteUnderTheMoveItExplains', () => {
    const placed = placeRejectionNotes(HISTORY, [SECOND_NOTE, FIRST_NOTE]);

    expect(placed.byTransition.get(0)?.map((note) => note.id)).toEqual([11]);
    expect(placed.byTransition.get(2)?.map((note) => note.id)).toEqual([12]);
    expect(placed.unplaced).toEqual([]);
  });

  it('placeRejectionNotes_shouldKeepNotesWithoutAMatchingMove_unplaced', () => {
    const orphan = makeComment({ id: 13, scope: 'phase', target: 'reject:4.2' });

    expect(placeRejectionNotes(HISTORY, [orphan]).unplaced).toEqual([orphan]);
  });

  it('rejectionNotes_shouldPickOnlyPhaseRejectionRoots', () => {
    const other = makeComment({ id: 14, scope: 'phase', target: 'notes' });
    const reply = makeComment({ id: 15, scope: 'phase', target: 'reject:1.4', parent_id: 11 });

    expect(rejectionNotes({ a: [FIRST_NOTE, other, reply] })).toEqual([FIRST_NOTE]);
  });
});

describe('PhaseHistory', () => {
  it('render_shouldShowRejectionNoteOnItsRow_andResolveIt', async () => {
    vi.mocked(core.resolveComment).mockResolvedValue({});
    showComments({ 'phase:reject:1.4': [FIRST_NOTE] });
    render(<PhaseHistory history={HISTORY} />);

    const rows = Array.from(document.querySelectorAll('.gw-phase-history-entry'));
    expect(rows[2]?.textContent).toContain('Research the cache first');
    expect(rows[0]?.textContent).not.toContain('Research the cache first');
    fireEvent.click(screen.getByText('vsc.common.resolve'));

    await waitFor(() => expect(core.resolveComment).toHaveBeenCalledWith(11, true));
  });

  it('render_shouldListNotesWithoutAHistoryRow_whenHistoryIsEmpty', () => {
    showComments({ 'phase:reject:1.4': [FIRST_NOTE] });
    render(<PhaseHistory history={[]} />);

    expect(screen.getByText('Research the cache first')).toBeTruthy();
  });
});
