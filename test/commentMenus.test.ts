import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPEN_THREAD_CONTEXT, RESOLVED_THREAD_CONTEXT } from '../src/comments/threadPresentation';

interface MenuEntry {
  command: string;
  when: string;
}

const menus = JSON.parse(readFileSync('package.json', 'utf8')).contributes.menus as Record<string, MenuEntry[]>;

function whenOf(menu: string, command: string): string {
  const entry = menus[menu].find((candidate) => candidate.command === command);
  if (entry === undefined) {
    throw new Error(`missing ${menu} entry ${command}`);
  }
  return entry.when;
}

describe('comment thread menus', () => {
  it('threadTitle_shouldOfferResolveOnOpenThreads_andReopenOnResolvedOnes', () => {
    expect(whenOf('comments/commentThread/title', 'governedWorkflow.comment.resolve')).toContain(`commentThread == ${OPEN_THREAD_CONTEXT}`);
    expect(whenOf('comments/commentThread/title', 'governedWorkflow.comment.unresolve')).toContain(`commentThread == ${RESOLVED_THREAD_CONTEXT}`);
  });

  it('nativeCommentsPanel_shouldHaveResolveAllTitleAction', () => {
    const entry = menus['view/title'].find((candidate) => candidate.when.startsWith('view == workbench.panel.comments'));

    expect(entry?.command).toBe('governedWorkflow.resolveAllComments');
  });
});
