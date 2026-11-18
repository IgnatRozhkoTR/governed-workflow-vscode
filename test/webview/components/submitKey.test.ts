import { describe, expect, it } from 'vitest';
import { isSubmitKey, type SubmitKeyEvent } from '../../../webview-ui/src/lib/submitKey';

function keyEvent(overrides: Partial<SubmitKeyEvent> = {}): SubmitKeyEvent {
  return { key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, isComposing: false, keyCode: 13, ...overrides };
}

describe('isSubmitKey', () => {
  it('isSubmitKey_shouldSubmit_whenPlainEnterInEnterMode', () => {
    expect(isSubmitKey(keyEvent(), 'enter')).toBe(true);
  });

  it('isSubmitKey_shouldInsertNewline_whenShiftEnterInEnterMode', () => {
    expect(isSubmitKey(keyEvent({ shiftKey: true }), 'enter')).toBe(false);
  });

  it('isSubmitKey_shouldSubmit_whenCtrlOrCmdEnterInEitherMode', () => {
    expect(isSubmitKey(keyEvent({ ctrlKey: true }), 'enter')).toBe(true);
    expect(isSubmitKey(keyEvent({ metaKey: true, shiftKey: true }), 'enter')).toBe(true);
    expect(isSubmitKey(keyEvent({ ctrlKey: true }), 'mod-enter')).toBe(true);
    expect(isSubmitKey(keyEvent({ metaKey: true }), 'mod-enter')).toBe(true);
  });

  it('isSubmitKey_shouldNotSubmit_whenPlainEnterInModEnterMode', () => {
    expect(isSubmitKey(keyEvent(), 'mod-enter')).toBe(false);
  });

  it('isSubmitKey_shouldNotSubmit_whenComposingText', () => {
    expect(isSubmitKey(keyEvent({ isComposing: true }), 'enter')).toBe(false);
    expect(isSubmitKey(keyEvent({ keyCode: 229 }), 'enter')).toBe(false);
  });

  it('isSubmitKey_shouldNotSubmit_whenKeyIsNotEnter', () => {
    expect(isSubmitKey(keyEvent({ key: 'a', keyCode: 65 }), 'enter')).toBe(false);
  });
});
