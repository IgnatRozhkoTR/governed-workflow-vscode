// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as reflectionApi from '../../../webview-ui/src/api/reflection';
import type { Proposal } from '../../../webview-ui/src/api/reflection';
import { ProposalCard } from '../../../webview-ui/src/tabs/reflection/ProposalCard';
import { applyPreview, isLongProposalBody } from '../../../webview-ui/src/tabs/reflection/proposalsModel';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

vi.mock('../../../webview-ui/src/api/reflection', () => ({
  resolveProposal: vi.fn(),
}));

function proposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    id: 4, type: 'rule_new', implementation_kind: 'manual', status: 'proposed', title: 'Money rule', body: 'Use integer cents.',
    payload_json: null, reason: null, result_json: null, created_at: '2026-11-09T10:00:00', reviewed_at: null, executed_at: null,
    ...overrides,
  };
}

function headerMarkApplied(): HTMLButtonElement {
  return document.querySelector('.gw-proposal-actions button') as HTMLButtonElement;
}

function confirmation(): HTMLElement | null {
  return document.querySelector('.gw-proposal-confirm');
}

function confirmButton(): HTMLButtonElement {
  const buttons = confirmation()?.querySelectorAll('button') ?? [];
  return buttons[buttons.length - 1] as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('applyPreview', () => {
  it('applyPreview_shouldShowPayload_whenProposalHasStructuredPayload', () => {
    expect(applyPreview(proposal({ payload_json: '{"name":"money","paths":["**/*.py"]}' }))).toEqual({ kind: 'payload', value: { name: 'money', paths: ['**/*.py'] } });
  });

  it('applyPreview_shouldFallBackToBody_whenPayloadIsEmptyObject', () => {
    expect(applyPreview(proposal({ payload_json: '{}' }))).toEqual({ kind: 'body', source: 'Use integer cents.' });
  });

  it('applyPreview_shouldBeNone_whenProposalHasNeitherPayloadNorBody', () => {
    expect(applyPreview(proposal({ body: '  ' }))).toEqual({ kind: 'none' });
  });
});

describe('ProposalCard mark applied', () => {
  it('markApplied_shouldShowPayloadPreviewWithoutResolving_whenClicked', () => {
    render(<ProposalCard proposal={proposal({ payload_json: '{"target":".claude/rules/money.md"}' })} />);

    fireEvent.click(headerMarkApplied());

    expect(confirmation()?.textContent).toContain('.claude/rules/money.md');
    expect(reflectionApi.resolveProposal).not.toHaveBeenCalled();
  });

  it('confirm_shouldResolveAsExecutedWithNote_whenUserConfirmsPreview', async () => {
    vi.mocked(reflectionApi.resolveProposal).mockResolvedValue(proposal({ status: 'executed' }));
    render(<ProposalCard proposal={proposal()} />);
    fireEvent.click(headerMarkApplied());

    fireEvent.input(confirmation()?.querySelector('textarea') as HTMLTextAreaElement, { target: { value: 'Added the rule file' } });
    fireEvent.click(confirmButton());

    await waitFor(() => expect(reflectionApi.resolveProposal).toHaveBeenCalledWith(4, 'executed', JSON.stringify({ result: 'Added the rule file' })));
    await waitFor(() => expect(confirmation()).toBeNull());
  });

  it('cancel_shouldCloseConfirmationWithoutResolving_whenUserCancels', () => {
    render(<ProposalCard proposal={proposal()} />);
    fireEvent.click(headerMarkApplied());

    fireEvent.click(confirmation()?.querySelector('button') as HTMLButtonElement);

    expect(confirmation()).toBeNull();
    expect(reflectionApi.resolveProposal).not.toHaveBeenCalled();
  });
});

function headerReject(): HTMLButtonElement {
  return document.querySelectorAll('.gw-proposal-actions button')[1] as HTMLButtonElement;
}

describe('ProposalCard reject', () => {
  it('reject_shouldAskForConfirmationWithoutResolving_whenClicked', () => {
    render(<ProposalCard proposal={proposal()} />);

    fireEvent.click(headerReject());

    expect(confirmation()?.textContent).toContain('vsc.reflection.rejectIntro');
    expect(reflectionApi.resolveProposal).not.toHaveBeenCalled();
  });

  it('confirm_shouldResolveAsRejected_whenUserConfirmsReject', async () => {
    vi.mocked(reflectionApi.resolveProposal).mockResolvedValue(proposal({ status: 'rejected' }));
    render(<ProposalCard proposal={proposal()} />);
    fireEvent.click(headerReject());

    fireEvent.click(confirmButton());

    await waitFor(() => expect(reflectionApi.resolveProposal).toHaveBeenCalledWith(4, 'rejected', undefined));
    await waitFor(() => expect(confirmation()).toBeNull());
  });

  it('cancel_shouldCloseRejectConfirmationWithoutResolving_whenUserCancels', () => {
    render(<ProposalCard proposal={proposal()} />);
    fireEvent.click(headerReject());

    fireEvent.click(confirmation()?.querySelector('button') as HTMLButtonElement);

    expect(confirmation()).toBeNull();
    expect(reflectionApi.resolveProposal).not.toHaveBeenCalled();
  });

  it('reject_shouldReplaceApplyConfirmation_whenClickedWhileApplyIsOpen', () => {
    render(<ProposalCard proposal={proposal()} />);
    fireEvent.click(headerMarkApplied());

    fireEvent.click(headerReject());

    expect(document.querySelectorAll('.gw-proposal-confirm')).toHaveLength(1);
    expect(confirmation()?.querySelector('textarea')).toBeNull();
  });
});

const LONG_BODY = Array.from({ length: 12 }, (_, index) => `Line ${index + 1} of the proposal.`).join('\n');

function bodyToggle(): HTMLButtonElement | null {
  return document.querySelector('.gw-proposal-body-toggle');
}

function isBodyClamped(): boolean {
  return document.querySelector('.gw-proposal-body-clamped') !== null;
}

describe('isLongProposalBody', () => {
  it('isLongProposalBody_shouldBeFalse_whenBodyIsAFewShortLines', () => {
    expect(isLongProposalBody('First line.\n\nSecond line.')).toBe(false);
  });

  it('isLongProposalBody_shouldBeTrue_whenBodyHasManyLines', () => {
    expect(isLongProposalBody(LONG_BODY)).toBe(true);
  });

  it('isLongProposalBody_shouldBeTrue_whenSingleParagraphIsVeryLong', () => {
    expect(isLongProposalBody('word '.repeat(200))).toBe(true);
  });
});

describe('ProposalCard body preview', () => {
  it('render_shouldShowFullBodyWithoutToggle_whenBodyIsShort', () => {
    render(<ProposalCard proposal={proposal()} />);

    expect(isBodyClamped()).toBe(false);
    expect(bodyToggle()).toBeNull();
  });

  it('render_shouldClampBodyWithShowMore_whenBodyIsLong', () => {
    render(<ProposalCard proposal={proposal({ body: LONG_BODY })} />);

    expect(isBodyClamped()).toBe(true);
    expect(bodyToggle()?.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggle_shouldExpandAndCollapseBody_whenClickedTwice', () => {
    render(<ProposalCard proposal={proposal({ body: LONG_BODY })} />);

    fireEvent.click(bodyToggle() as HTMLButtonElement);
    expect(isBodyClamped()).toBe(false);
    expect(bodyToggle()?.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(bodyToggle() as HTMLButtonElement);
    expect(isBodyClamped()).toBe(true);
  });

  it('render_shouldPlaceReasonInHeaderRow_whenProposalHasReason', () => {
    render(<ProposalCard proposal={proposal({ reason: 'Observed during QA fixture run' })} />);

    expect(document.querySelector('.gw-card-title .gw-proposal-reason')?.textContent).toContain('Observed during QA fixture run');
    expect(document.querySelector('.gw-card-body .gw-proposal-reason')).toBeNull();
  });
});
