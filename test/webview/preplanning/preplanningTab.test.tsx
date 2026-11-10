// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Discussion, WorkspaceState } from '../../../src/api/types';
import { registerModuleMessages } from '../../../webview-ui/src/i18n/i18n';
import { store } from '../../../webview-ui/src/store/store';
import { PREPLANNING_MESSAGES } from '../../../webview-ui/src/tabs/preplanning/messages';
import { PreplanningTab } from '../../../webview-ui/src/tabs/preplanning/PreplanningTab';
import { makeState } from '../../support/fixtures';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../../webview-ui/src/api/preplanning', () => ({
  getContext: vi.fn(() => new Promise(() => undefined)),
}));

registerModuleMessages(PREPLANNING_MESSAGES);

const OPEN_DISCUSSION: Discussion = {
  id: 1, parent_id: null, text: 'Tax order?', author: 'agent', status: 'open', type: 'general', hidden: null, created_at: '2026-11-09T10:00:00', resolved_at: null, replies: [],
};

const SECTION_IDS = ['preplanning-approval', 'preplanning-ticket', 'preplanning-research', 'preplanning-impact', 'preplanning-discussions', 'preplanning-approval-feedback'];

function showWorkspace(overrides: Partial<WorkspaceState>): void {
  store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: makeState(overrides), etag: null } });
}

function renderedSectionIds(): string[] {
  const container = document.querySelector('.gw-pp') as HTMLElement;
  return Array.from(container.children).map((child) => child.id);
}

afterEach(cleanup);

function navigateToAnchor(anchor: string): void {
  act(() => store.navigate({ tab: 'preplanning', anchor }));
}

function anchorSection(id: string): HTMLElement {
  return document.getElementById(id) as HTMLElement;
}

describe('PreplanningTab', () => {
  it('render_shouldPutStatusFirstAndGateCardLast_whenPreplanningGateIsWaiting', () => {
    showWorkspace({ phase: '1.4', pending_gate: { phase: '1.4', accepts_commit_message: false } });

    render(<PreplanningTab active />);

    expect(renderedSectionIds()).toEqual(SECTION_IDS);
  });

  it('render_shouldHeadTheReviewWithoutRepeatingTheBarsCounts_whenPreplanningGateIsWaiting', () => {
    showWorkspace({
      phase: '1.4',
      pending_gate: { phase: '1.4', accepts_commit_message: false },
      impact_analysis: { affected_flows: ['checkout'], open_questions: 'Rounding?' },
      discussions: [OPEN_DISCUSSION],
    });

    render(<PreplanningTab active />);

    const status = document.getElementById('preplanning-approval');
    expect(status?.querySelector('h2')?.textContent).toBe('phaseAction.preplanningReview');
    expect(status?.querySelector('.gw-badge')).toBeNull();
  });

  it('render_shouldShowOnlyEvidence_whenNoPreplanningGateIsWaiting', () => {
    showWorkspace({ phase: '2.0', pending_gate: null });

    render(<PreplanningTab active />);

    expect(renderedSectionIds()).toEqual(SECTION_IDS.slice(1, -1));
  });
});

describe('PreplanningTab anchors', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    act(() => store.navigate({ tab: 'preplanning' }));
  });

  it.each(['preplanning-research', 'preplanning-impact', 'preplanning-discussions'])('navigate_shouldScrollAndFlash_whenAnchorIs%s', async (anchor) => {
    showWorkspace({ phase: '1.4', impact_analysis: { affected_flows: ['checkout'] }, discussions: [OPEN_DISCUSSION] });
    render(<PreplanningTab active nav={{ tab: 'preplanning' }} />);

    navigateToAnchor(anchor);

    await waitFor(() => expect(anchorSection(anchor).classList.contains('gw-card-highlight')).toBe(true));
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
    expect(vi.mocked(Element.prototype.scrollIntoView).mock.contexts).toContain(anchorSection(anchor));
  });

  it('navigate_shouldExpandCollapsedImpactSections_whenAnchorIsImpact', async () => {
    showWorkspace({ phase: '1.4', impact_analysis: { affected_flows: ['checkout'], open_questions: 'Rounding?' } });
    render(<PreplanningTab active nav={{ tab: 'preplanning' }} />);
    const impact = anchorSection('preplanning-impact');
    expect(impact.querySelectorAll('.gw-card-body')).toHaveLength(0);

    navigateToAnchor('preplanning-impact');

    await waitFor(() => expect(impact.querySelectorAll('.gw-card-body')).toHaveLength(2));
    expect(impact.textContent).toContain('Rounding?');
  });
});
