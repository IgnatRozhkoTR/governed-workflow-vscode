// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button } from '../../webview-ui/src/components/Button';
import { Toggle } from '../../webview-ui/src/components/Toggle';

afterEach(cleanup);

describe('Toggle', () => {
  it('render_shouldNameSwitch_whenOnlyAriaLabelIsGiven', () => {
    render(<Toggle checked={false} onChange={vi.fn()} ariaLabel="YOLO mode" />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe('YOLO mode');
  });

  it('render_shouldPreferVisibleLabel_whenBothLabelsAreGiven', () => {
    render(<Toggle checked onChange={vi.fn()} label="Fast mode" ariaLabel="ignored" />);
    expect(screen.getByRole('switch').getAttribute('aria-label')).toBe('Fast mode');
  });
});

describe('Button', () => {
  it('render_shouldFocusAndMarkButton_whenAutoFocusIsSet', () => {
    render(<Button label="Approve" autoFocus onClick={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.hasAttribute('data-autofocus')).toBe(true);
    expect(document.activeElement).toBe(button);
  });

  it('render_shouldNotFocusOrMark_whenAutoFocusIsAbsent', () => {
    render(<Button label="Approve" onClick={vi.fn()} />);
    const button = screen.getByRole('button');
    expect(button.hasAttribute('data-autofocus')).toBe(false);
    expect(document.activeElement).not.toBe(button);
  });
});
