// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

const putContext = vi.fn();

vi.mock('../../../webview-ui/src/api/settings', () => ({ putContext: (update: unknown) => putContext(update), searchPaths: vi.fn() }));
vi.mock('../../../webview-ui/src/api/preplanning', () => ({ getContext: vi.fn() }));
vi.mock('../../../webview-ui/src/tabs/settings/sections/useStartClaude', () => ({ useStartClaude: () => vi.fn() }));
vi.mock('../../../webview-ui/src/store/hooks', () => ({
  useWorkspaceState: () => ({ working_dir: '/w' }),
  useResource: () => ({
    data: { ticket_id: 'feature/x', ticket_name: 'Fix login', context: 'Long description', refs: ['src/a.ts'], discussions: [] },
    error: undefined,
    loading: false,
    reload: vi.fn(),
  }),
  useMutation: (fn: (...args: unknown[]) => Promise<unknown>) => ({ run: (...args: unknown[]) => fn(...args), pending: false }),
}));

const { taskSection } = await import('../../../webview-ui/src/tabs/settings/sections/task');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function fieldByLabel(label: string): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement;
}

describe('task settings section', () => {
  it('render_shouldLoadTicketNameAndContextIntoTheirOwnFields', () => {
    const Section = taskSection.Component;
    render(<Section active />);

    expect(fieldByLabel('labels.ticketName').value).toBe('Fix login');
    expect(fieldByLabel('labels.context').value).toBe('Long description');
  });

  it('save_shouldSendTicketNameAsTicketNameAndContextAsContext', async () => {
    const Section = taskSection.Component;
    render(<Section active />);

    fireEvent.input(fieldByLabel('labels.ticketName'), { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: /buttons.saveContext/ }));
    await vi.waitFor(() => expect(putContext).toHaveBeenCalled());

    expect(putContext).toHaveBeenCalledWith({ ticket_name: 'New name', context: 'Long description', refs: ['src/a.ts'] });
  });
});
