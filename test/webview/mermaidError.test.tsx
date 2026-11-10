// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MermaidError } from '../../webview-ui/src/components/MermaidError';

vi.stubGlobal('acquireVsCodeApi', () => ({ postMessage: vi.fn(), getState: () => undefined, setState: vi.fn() }));

afterEach(cleanup);

const PARSER_OUTPUT = "Parse error on line 3:\n...A --> B[\n----^\nExpecting 'SQE', 'DOUBLECIRCLEEND'";

describe('MermaidError', () => {
  it('render_shouldShowTitleAndFirstLine_withRawOutputCollapsed', () => {
    render(<MermaidError error={new Error(PARSER_OUTPUT)} source="flowchart LR" title="Architecture" />);
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('vsc.mermaid.renderFailedTitled');
    expect(screen.getByText('Parse error on line 3')).not.toBeNull();
    expect(screen.queryByText(/Expecting 'SQE'/)).toBeNull();
  });

  it('render_shouldRevealRawOutput_whenDetailsAreExpanded', () => {
    render(<MermaidError error={new Error(PARSER_OUTPUT)} source="flowchart LR" />);
    fireEvent.click(screen.getByRole('button', { name: 'vsc.mermaid.details' }));
    expect(screen.getByText(/Expecting 'SQE'/)).not.toBeNull();
  });
});
