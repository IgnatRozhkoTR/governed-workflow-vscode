import { describe, expect, it } from 'vitest';
import { humanizeKey, sentenceCase } from '../../../webview-ui/src/components/humanizeKey';

const identity = (key: string): string => key;

describe('humanizeKey', () => {
  it('humanizeKey_shouldUseTranslation_whenKeyIsKnown', () => {
    const translate = (key: string): string => (key === 'vsc.detailKey.agents_deployed' ? 'Agents deployed' : key);
    expect(humanizeKey(translate, 'agents_deployed')).toBe('Agents deployed');
  });

  it('humanizeKey_shouldSentenceCase_whenKeyIsUnknownSnakeCase', () => {
    expect(humanizeKey(identity, 'files_changed')).toBe('Files changed');
  });

  it('humanizeKey_shouldKeepKey_whenItIsNotSnakeCase', () => {
    expect(humanizeKey(identity, 'src/app/main.py')).toBe('src/app/main.py');
    expect(sentenceCase('HTTPStatus')).toBe('HTTPStatus');
  });
});
