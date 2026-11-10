import type { Discussion } from '@api-types';
import { describe, expect, it } from 'vitest';
import { linkedDiscussionTitle } from '../../../webview-ui/src/tabs/preplanning/discussionLogic';

const translate = (key: string, params?: Record<string, string | number>): string => `${key}|${params?.title ?? ''}`;

describe('linkedDiscussionTitle', () => {
  it('linkedDiscussionTitle_shouldUseTheDiscussionText_notItsId', () => {
    const discussion = { id: 3894, text: 'Which cache layer?\nDetails' } as Discussion;

    expect(linkedDiscussionTitle(translate, discussion)).toBe('vsc.research.linkedDiscussionTitle|Which cache layer? Details');
  });

  it('linkedDiscussionTitle_shouldFallBackToAGenericLabel_whenTheDiscussionIsMissing', () => {
    expect(linkedDiscussionTitle(translate, undefined)).toBe('vsc.research.openLinkedDiscussion|');
  });
});
