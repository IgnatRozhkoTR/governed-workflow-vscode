import type { TabId } from '@shared/navigation';
import type { JSX } from 'preact';
import { Icon } from '../components/Icon';
import { classNames, toneClass } from '../components/types';
import { useT } from '../i18n/i18n';
import type { TabModule } from '../tabs/types';

export interface TabBarProps {
  readonly modules: readonly TabModule[];
  readonly activeId: TabId;
  readonly onSelect: (id: TabId) => void;
}

const NO_BADGE = (): undefined => undefined;

function TabButton({ module, isActive, onSelect }: { readonly module: TabModule; readonly isActive: boolean; readonly onSelect: (id: TabId) => void }): JSX.Element {
  const t = useT();
  const badge = (module.useBadge ?? NO_BADGE)();
  return (
    <button type="button" role="tab" aria-selected={isActive} class={classNames('gw-tab', isActive && 'gw-tab-active')} onClick={() => onSelect(module.id)}>
      <Icon name={module.icon} />
      <span>{t(module.titleKey)}</span>
      {badge !== undefined && badge.count > 0 && <span class={classNames('gw-tab-badge', toneClass(badge.tone))}>{badge.count}</span>}
    </button>
  );
}

export function TabBar({ modules, activeId, onSelect }: TabBarProps): JSX.Element {
  return (
    <nav class="gw-tabs gw-tabs-top gw-tab-bar" role="tablist">
      {modules.map((module) => <TabButton key={module.id} module={module} isActive={module.id === activeId} onSelect={onSelect} />)}
    </nav>
  );
}
