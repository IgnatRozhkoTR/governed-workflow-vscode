import { describe, expect, it } from 'vitest';
import { runStatusLabel } from '../../../webview-ui/src/tabs/phase/statusLabel';

const translate = (key: string): string => `t:${key}`;

describe('runStatusLabel', () => {
  it('runStatusLabel_shouldTranslate_whenStatusIsKnown', () => {
    expect(runStatusLabel(translate, 'passed')).toBe('t:vsc.runStatus.passed');
  });

  it('runStatusLabel_shouldTranslate_whenStatusIsWarning', () => {
    expect(runStatusLabel(translate, 'warning')).toBe('t:vsc.runStatus.warning');
  });

  it('runStatusLabel_shouldKeepRawText_whenStatusIsUnknown', () => {
    expect(runStatusLabel(translate, 'weird')).toBe('weird');
  });
});
