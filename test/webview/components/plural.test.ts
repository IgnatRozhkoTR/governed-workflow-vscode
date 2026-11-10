import { describe, expect, it } from 'vitest';
import { pluralCategory } from '../../../webview-ui/src/components/plural';

describe('pluralCategory', () => {
  it('pluralCategory_shouldSplitOneAndOther_whenLocaleIsEnglish', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    expect(pluralCategory('en', 8)).toBe('other');
  });

  it('pluralCategory_shouldUseRussianForms_whenLocaleIsRussian', () => {
    expect(pluralCategory('ru', 1)).toBe('one');
    expect(pluralCategory('ru', 3)).toBe('few');
    expect(pluralCategory('ru', 8)).toBe('many');
    expect(pluralCategory('ru', 21)).toBe('one');
    expect(pluralCategory('ru', 11)).toBe('many');
  });
});
