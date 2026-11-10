// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Card } from '../webview-ui/src/components/Card';
import { Header } from '../webview-ui/src/shell/Header';
import { store } from '../webview-ui/src/store/store';
import { makeState } from './support/fixtures';

let persisted: unknown;
vi.stubGlobal('acquireVsCodeApi', () => ({
  postMessage: vi.fn(),
  getState: () => persisted,
  setState: (value: unknown) => { persisted = value; },
}));

afterEach(cleanup);

describe('Card', () => {
  it('collapses and expands from the header toggle', () => {
    render(<Card id="c1" title="Plan">body text</Card>);
    const toggle = screen.getByRole('button');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(screen.queryByText('body text')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles when the title is clicked but not when an action is clicked', () => {
    const onAction = vi.fn();
    render(<Card id="c2" title="Plan" actions={<button type="button" onClick={onAction}>act</button>}>body text</Card>);
    fireEvent.click(screen.getByText('act'));
    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByText('body text')).not.toBeNull();
    fireEvent.click(screen.getByText('Plan'));
    expect(screen.queryByText('body text')).toBeNull();
  });

  it('render_shouldNameToggle_withTitleTextOrTitleElement', () => {
    render(<><Card id="c3" title="Scope">a</Card><Card id="c4" title={<span>Rich</span>}>b</Card></>);
    const [named, rich] = screen.getAllByRole('button');
    expect(named?.getAttribute('aria-label')).toBe('Scope');
    expect(named?.getAttribute('aria-expanded')).toBe('true');
    const labelId = rich?.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(labelId)?.textContent).toBe('Rich');
  });

  it('restores the collapsed state per card id', () => {
    const first = render(<Card id="persisted" title="Plan">body text</Card>);
    fireEvent.click(screen.getByText('Plan'));
    first.unmount();
    render(<Card id="persisted" title="Plan">body text</Card>);
    expect(screen.queryByText('body text')).toBeNull();
  });
});

describe('state without pending_gate', () => {
  it('renders the header without throwing', () => {
    const { pending_gate: _omitted, ...legacy } = makeState();
    store.applyHostEvent({ kind: 'event', event: 'state', payload: { workspace: { projectId: 'p', branch: 'b' }, state: legacy as never, etag: null } });
    expect(() => render(<Header />)).not.toThrow();
  });
});
