import type { TabModule } from '../types';
import { PreplanningTab } from './PreplanningTab';
import { countOpenDiscussions } from './discussionLogic';
import { PREPLANNING_MESSAGES } from './messages';
import { useStore } from '../../store/hooks';
import './preplanning.css';

function usePreplanningBadge(): { count: number; tone: 'warning' } | undefined {
  const open = useStore((s) => countOpenDiscussions(s.state?.discussions ?? []));
  return open > 0 ? { count: open, tone: 'warning' } : undefined;
}

export const preplanningTab: TabModule = {
  id: 'preplanning',
  titleKey: 'tabs.preplanning',
  icon: 'comment-discussion',
  messages: PREPLANNING_MESSAGES,
  useBadge: usePreplanningBadge,
  Component: PreplanningTab,
};
