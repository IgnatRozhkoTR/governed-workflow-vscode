// @vitest-environment happy-dom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DialogHost, useDialogs } from '../../webview-ui/src/components/DialogHost';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

afterEach(cleanup);

function footerButton(label: string): HTMLButtonElement {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.gw-dialog-footer button')).find((button) => button.textContent === label) as HTMLButtonElement;
}

describe('DialogHost', () => {
  it('confirm_shouldFocusConfirmButton_andResolveTrueWhenActivated', async () => {
    render(<DialogHost />);
    const answer = useDialogs().confirm({ title: 'Approve?', confirmLabel: 'Approve' });

    await waitFor(() => expect(document.activeElement).toBe(footerButton('Approve')));
    fireEvent.click(document.activeElement as HTMLElement);

    await expect(answer).resolves.toBe(true);
  });

  it('prompt_shouldRenderDangerConfirm_whenDangerRequested', async () => {
    render(<DialogHost />);
    const answer = useDialogs().prompt({ title: 'Reject', confirmLabel: 'Reject', danger: true });

    await waitFor(() => expect(footerButton('Reject')).toBeTruthy());
    expect(footerButton('Reject').classList.contains('gw-button-danger')).toBe(true);
    fireEvent.click(footerButton('Reject'));
    await expect(answer).resolves.toBe('');
  });

  it('close_shouldFocusMainArea_whenTriggerWasDisabledMeanwhile', async () => {
    render(<><main id="gw-main" tabIndex={-1} /><button type="button" id="trigger">open</button><DialogHost /></>);
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    const answer = useDialogs().confirm({ title: 'Go?', confirmLabel: 'Go' });
    await waitFor(() => expect(document.activeElement).toBe(footerButton('Go')));

    trigger.disabled = true;
    fireEvent.click(footerButton('Go'));
    await answer;

    await waitFor(() => expect(document.activeElement?.id).toBe('gw-main'));
  });

  it('close_shouldReturnFocusToTrigger_onceItIsEnabledAgain', async () => {
    render(<><main id="gw-main" tabIndex={-1} /><button type="button" id="trigger">open</button><DialogHost /></>);
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    const answer = useDialogs().confirm({ title: 'Go?', confirmLabel: 'Go' });
    await waitFor(() => expect(document.activeElement).toBe(footerButton('Go')));

    trigger.disabled = true;
    fireEvent.click(footerButton('Go'));
    await answer;
    await waitFor(() => expect(document.activeElement?.id).toBe('gw-main'));
    trigger.disabled = false;

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('close_shouldKeepUserFocus_whenUserMovedOnBeforeTriggerIsEnabled', async () => {
    render(<><main id="gw-main" tabIndex={-1} /><button type="button" id="trigger">open</button><input id="elsewhere" /><DialogHost /></>);
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    const answer = useDialogs().confirm({ title: 'Go?', confirmLabel: 'Go' });
    await waitFor(() => expect(document.activeElement).toBe(footerButton('Go')));

    trigger.disabled = true;
    fireEvent.click(footerButton('Go'));
    await answer;
    await waitFor(() => expect(document.activeElement?.id).toBe('gw-main'));
    (document.getElementById('elsewhere') as HTMLInputElement).focus();
    trigger.disabled = false;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(document.activeElement?.id).toBe('elsewhere');
  });

  it('close_shouldRestoreFocusToTrigger_whenTriggerIsStillUsable', async () => {
    render(<><main id="gw-main" tabIndex={-1} /><button type="button" id="trigger">open</button><DialogHost /></>);
    const trigger = document.getElementById('trigger') as HTMLButtonElement;
    trigger.focus();
    const answer = useDialogs().confirm({ title: 'Go?', confirmLabel: 'Go' });
    await waitFor(() => expect(document.activeElement).toBe(footerButton('Go')));

    fireEvent.click(footerButton('vsc.common.cancel'));
    await answer;

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
