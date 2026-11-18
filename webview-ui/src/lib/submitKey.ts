export type SubmitOn = 'enter' | 'mod-enter';

const IME_COMPOSITION_KEY_CODE = 229;

export interface SubmitKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly isComposing: boolean;
  readonly keyCode: number;
}

export function isSubmitKey(event: SubmitKeyEvent, submitOn: SubmitOn): boolean {
  if (event.key !== 'Enter' || event.isComposing || event.keyCode === IME_COMPOSITION_KEY_CODE) {
    return false;
  }
  const hasModifier = event.ctrlKey || event.metaKey;
  return submitOn === 'enter' ? hasModifier || !event.shiftKey : hasModifier;
}
