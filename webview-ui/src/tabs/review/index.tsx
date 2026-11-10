import type { TabModule } from '../types';
import { REVIEW_MESSAGES } from './messages';
import { ReviewTab, useBlockingReviewCount, useIsTicketFinished } from './ReviewTab';
import './review.css';

export const reviewTab: TabModule = {
  id: 'review',
  titleKey: 'tabs.review',
  icon: 'comment',
  messages: REVIEW_MESSAGES,
  useBadge: () => {
    const count = useBlockingReviewCount();
    const isFinished = useIsTicketFinished();
    return count > 0 && !isFinished ? { count, tone: 'warning' } : undefined;
  },
  Component: ReviewTab,
};
