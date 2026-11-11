import { describe, expect, it } from 'vitest';
import { DEFAULT_ON_SELECT_WORKSPACE, parseOnSelectWorkspace } from '../src/worktree/onSelectWorkspace';

describe('parseOnSelectWorkspace', () => {
  it.each(['newWindow', 'sameWindow', 'addFolder', 'off'])('parseOnSelectWorkspace_shouldKeep_%s', (value) => {
    expect(parseOnSelectWorkspace(value)).toBe(value);
  });

  it.each([undefined, null, '', 'NewWindow', 42])('parseOnSelectWorkspace_shouldFallBackToNewWindow_whenValueIs_%s', (value) => {
    expect(parseOnSelectWorkspace(value)).toBe(DEFAULT_ON_SELECT_WORKSPACE);
    expect(DEFAULT_ON_SELECT_WORKSPACE).toBe('newWindow');
  });
});
