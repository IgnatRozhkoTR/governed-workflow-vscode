import { listProposals } from '../../api/reflection';
import { useResource } from '../../store/hooks';
import type { TabModule } from '../types';
import { countPending } from './proposalsModel';
import { REFLECTION_MESSAGES } from './messages';
import { ReflectionTab } from './ReflectionTab';
import './reflection.css';

export const reflectionTab: TabModule = {
  id: 'reflection',
  titleKey: 'vsc.tabs.reflection',
  icon: 'lightbulb',
  messages: REFLECTION_MESSAGES,
  useBadge: () => {
    const proposals = useResource('proposals', 'badge', () => listProposals());
    const count = countPending(proposals.data?.proposals ?? []);
    return count > 0 ? { count, tone: 'warning' } : undefined;
  },
  Component: ReflectionTab,
};
