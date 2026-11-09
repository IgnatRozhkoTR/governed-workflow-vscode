import { useStore } from '../../store/hooks';
import { openCountByScope } from '../../lib/comments';
import type { TabModule } from '../types';
import { REVIEW_MESSAGES } from './messages';
import { ReviewTab } from './ReviewTab';
import './review.css';

const REVIEW_SCOPE = 'review';

export const reviewTab: TabModule = {
  id: 'review',
  titleKey: 'tabs.review',
  icon: 'comment',
  messages: REVIEW_MESSAGES,
  useBadge: () => {
    const count = useStore((s) => (s.state === null ? 0 : openCountByScope(s.state, REVIEW_SCOPE)));
    return count > 0 ? { count, tone: 'warning' } : undefined;
  },
  Component: ReviewTab,
};
