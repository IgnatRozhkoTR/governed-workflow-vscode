import type { Scratchpad } from '@api-types';
import { describe, expect, it } from 'vitest';
import { hasBody, resolveSelection, type ScratchpadSection } from '../../../webview-ui/src/tabs/scratchpads/scratchpadSections';

function file(name: string, updatedAt: string, content = `# ${name}\n\nSome notes.\n`): Scratchpad {
  return { name, title: name, updated_at: updatedAt, size: new TextEncoder().encode(content).length };
}

function headingOnly(name: string, updatedAt: string): Scratchpad {
  return file(name, updatedAt, `# ${name}\n`);
}

const SECTIONS: readonly ScratchpadSection[] = [
  { repo: '', label: '', files: [file('root.md', '2026-01-02T00:00:00')] },
  { repo: 'api', label: 'api', files: [file('api.md', '2026-01-03T00:00:00')] },
];

describe('resolveSelection', () => {
  it('resolveSelection_shouldKeepStoredFile_whenItStillExists', () => {
    expect(resolveSelection(SECTIONS, { repo: '', name: 'root.md' })).toEqual({ repo: '', name: 'root.md' });
  });

  it('resolveSelection_shouldPickMostRecentFileAcrossRepos_whenNothingIsStored', () => {
    expect(resolveSelection(SECTIONS, { repo: '', name: '' })).toEqual({ repo: 'api', name: 'api.md' });
  });

  it('resolveSelection_shouldFallBack_whenStoredFileBelongsToAnotherRepo', () => {
    expect(resolveSelection(SECTIONS, { repo: '', name: 'api.md' })).toEqual({ repo: 'api', name: 'api.md' });
  });

  it('resolveSelection_shouldBeUndefined_whenThereAreNoFiles', () => {
    expect(resolveSelection([{ repo: '', label: '', files: [] }], { repo: '', name: '' })).toBeUndefined();
  });

  it('resolveSelection_shouldSkipHeadingOnlyPad_whenItIsTheMostRecent', () => {
    const sections: readonly ScratchpadSection[] = [
      { repo: '', label: '', files: [headingOnly('Nearly empty', '2026-01-05T00:00:00'), file('notes.md', '2026-01-02T00:00:00'), file('older.md', '2026-01-01T00:00:00')] },
    ];

    expect(resolveSelection(sections, { repo: '', name: '' })).toEqual({ repo: '', name: 'notes.md' });
  });

  it('resolveSelection_shouldBeUndefined_whenEveryPadIsHeadingOnly', () => {
    const sections: readonly ScratchpadSection[] = [{ repo: '', label: '', files: [headingOnly('Draft', '2026-01-05T00:00:00')] }];

    expect(resolveSelection(sections, { repo: '', name: '' })).toBeUndefined();
  });

  it('resolveSelection_shouldKeepStoredHeadingOnlyPad_whenUserPickedIt', () => {
    const sections: readonly ScratchpadSection[] = [{ repo: '', label: '', files: [headingOnly('Draft', '2026-01-05T00:00:00'), file('notes.md', '2026-01-02T00:00:00')] }];

    expect(resolveSelection(sections, { repo: '', name: 'Draft' })).toEqual({ repo: '', name: 'Draft' });
  });
});

describe('hasBody', () => {
  it('hasBody_shouldBeFalse_whenFileHoldsOnlyItsCyrillicHeading', () => {
    expect(hasBody(headingOnly('Почти пусто', '2026-01-01T00:00:00'))).toBe(false);
  });

  it('hasBody_shouldBeTrue_whenFileHasTextBelowTheHeading', () => {
    expect(hasBody(file('Почти пусто', '2026-01-01T00:00:00'))).toBe(true);
  });

  it('hasBody_shouldBeFalse_whenFileIsEmpty', () => {
    expect(hasBody({ name: 'blank.md', title: 'Blank', updated_at: '2026-01-01T00:00:00', size: 0 })).toBe(false);
  });
});
