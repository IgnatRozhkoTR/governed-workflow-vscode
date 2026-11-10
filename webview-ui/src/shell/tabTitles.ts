import type { TabId } from '@shared/navigation';
import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import { useT } from '../i18n/i18n';
import type { TabModule } from '../tabs/types';

export const TabModulesContext = createContext<readonly TabModule[]>([]);

// Names a tab the way the tab strip does, so a link can say where it leads.
export function useTabTitle(): (tab: TabId) => string {
  const t = useT();
  const modules = useContext(TabModulesContext);
  return (tab) => {
    const module = modules.find((candidate) => candidate.id === tab);
    return module === undefined ? tab : t(module.titleKey);
  };
}
