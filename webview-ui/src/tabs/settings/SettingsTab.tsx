import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { EmptyState } from '../../components';
import { classNames } from '../../components/types';
import { useT } from '../../i18n/i18n';
import { useNav } from '../../store/hooks';
import type { SettingsSectionModule, TabProps } from '../types';
import { SETTINGS_SECTIONS } from './sections';

export function SettingsTab({ active, nav }: TabProps): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const sections = useMemo(() => [...SETTINGS_SECTIONS].sort((left, right) => left.order - right.order), []);
  const current = sections.find((section) => section.id === nav.section) ?? sections[0];
  if (current === undefined) {
    return <EmptyState icon="settings-gear" message={t('vsc.settings.noSections')} />;
  }
  return (
    <div class="gw-settings">
      <nav class="gw-settings-nav">
        {sections.map((section) => (
          <button
            type="button"
            key={section.id}
            class={classNames('gw-settings-nav-item', section.id === current.id && 'gw-settings-nav-item-active')}
            onClick={() => navigate({ tab: 'settings', section: section.id })}
          >
            {t(section.titleKey)}
          </button>
        ))}
      </nav>
      <div class="gw-settings-body">
        {sections.map((section) => <SettingsSection key={section.id} section={section} isVisible={section.id === current.id} isTabActive={active} />)}
      </div>
    </div>
  );
}

function SettingsSection({ section, isVisible, isTabActive }: { readonly section: SettingsSectionModule; readonly isVisible: boolean; readonly isTabActive: boolean }): JSX.Element {
  const { Component } = section;
  return (
    <div class="gw-settings-section" hidden={!isVisible}>
      <Component active={isVisible && isTabActive} />
    </div>
  );
}
