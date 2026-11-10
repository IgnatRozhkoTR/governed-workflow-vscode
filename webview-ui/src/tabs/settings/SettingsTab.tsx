import type { JSX } from 'preact';
import { useEffect, useMemo } from 'preact/hooks';
import { EmptyState } from '../../components';
import { classNames } from '../../components/types';
import { useT } from '../../i18n/i18n';
import { useNav, usePersistentState } from '../../store/hooks';
import type { SettingsSectionId } from '@shared/navigation';
import type { SettingsSectionModule, TabProps } from '../types';
import { SETTINGS_SECTIONS } from './sections';

interface SettingsGroup {
  readonly titleKey: string | undefined;
  readonly sections: readonly SettingsSectionModule[];
}

const GROUP_LAYOUT: readonly { readonly titleKey: string; readonly sectionIds: readonly SettingsSectionId[] }[] = [
  { titleKey: 'settings.group.task', sectionIds: ['task'] },
  { titleKey: 'settings.group.workflow', sectionIds: ['workflow', 'phases', 'reviewMode', 'verification', 'rules'] },
  { titleKey: 'settings.group.system', sectionIds: ['git', 'claude', 'system'] },
];

function groupSections(sections: readonly SettingsSectionModule[]): SettingsGroup[] {
  const grouped = GROUP_LAYOUT.map((group) => ({ titleKey: group.titleKey, sections: sections.filter((section) => group.sectionIds.includes(section.id)) }));
  const groupedIds = new Set(GROUP_LAYOUT.flatMap((group) => group.sectionIds));
  const ungrouped = sections.filter((section) => !groupedIds.has(section.id));
  return [...grouped, { titleKey: undefined, sections: ungrouped }].filter((group) => group.sections.length > 0);
}

const REMEMBERED_SECTION_KEY = 'settings.section';
const NO_REMEMBERED_SECTION = '';

// Tab switches and state polls navigate to { tab: 'settings' } without a section, so the last picked section is the fallback.
export function resolveSettingsSection(
  sections: readonly SettingsSectionModule[],
  navSection: string | undefined,
  rememberedSection: string,
): SettingsSectionModule | undefined {
  return sections.find((section) => section.id === navSection)
    ?? sections.find((section) => section.id === rememberedSection)
    ?? sections[0];
}

export function SettingsTab({ active, nav }: TabProps): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const [rememberedSection, rememberSection] = usePersistentState(REMEMBERED_SECTION_KEY, NO_REMEMBERED_SECTION);
  const sections = useMemo(() => [...SETTINGS_SECTIONS].sort((left, right) => left.order - right.order), []);
  const groups = useMemo(() => groupSections(sections), [sections]);
  const current = resolveSettingsSection(sections, nav.section, rememberedSection);
  useEffect(() => {
    if (current !== undefined && current.id !== rememberedSection) {
      rememberSection(current.id);
    }
  }, [current?.id]);
  if (current === undefined) {
    return <EmptyState icon="settings-gear" message={t('vsc.settings.noSections')} />;
  }
  const goTo = (sectionId: SettingsSectionId): void => navigate({ tab: 'settings', section: sectionId });
  return (
    <div class="gw-settings">
      <SettingsSectionPicker groups={groups} currentId={current.id} onPick={goTo} />
      <SettingsNav groups={groups} currentId={current.id} onPick={goTo} />
      <div class="gw-settings-body">
        {sections.map((section) => <SettingsSection key={section.id} section={section} isVisible={section.id === current.id} isTabActive={active} />)}
      </div>
    </div>
  );
}

interface SectionNavigationProps {
  readonly groups: readonly SettingsGroup[];
  readonly currentId: SettingsSectionId;
  readonly onPick: (sectionId: SettingsSectionId) => void;
}

function SettingsNav({ groups, currentId, onPick }: SectionNavigationProps): JSX.Element {
  const t = useT();
  return (
    <nav class="gw-settings-nav" aria-label={t('tabs.settings')}>
      {groups.map((group) => (
        <div key={group.titleKey ?? 'other'} class="gw-settings-nav-group">
          {group.titleKey !== undefined && <div class="gw-settings-nav-group-title">{t(group.titleKey)}</div>}
          {group.sections.map((section) => (
            <button
              type="button"
              key={section.id}
              class={classNames('gw-settings-nav-item', section.id === currentId && 'gw-settings-nav-item-active')}
              aria-current={section.id === currentId ? 'page' : undefined}
              onClick={() => onPick(section.id)}
            >
              {t(section.titleKey)}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

// Narrow panels show this single select instead of the side nav, which would otherwise wrap into several rows above the form.
function SettingsSectionPicker({ groups, currentId, onPick }: SectionNavigationProps): JSX.Element {
  const t = useT();
  const pick = (value: string): void => {
    const picked = groups.flatMap((group) => group.sections).find((section) => section.id === value);
    if (picked !== undefined) {
      onPick(picked.id);
    }
  };
  return (
    <select class="gw-select gw-settings-picker" aria-label={t('tabs.settings')} value={currentId} onChange={(event) => pick(event.currentTarget.value)}>
      {groups.map((group) => (
        <optgroup key={group.titleKey ?? 'other'} label={group.titleKey === undefined ? '' : t(group.titleKey)}>
          {group.sections.map((section) => <option key={section.id} value={section.id}>{t(section.titleKey)}</option>)}
        </optgroup>
      ))}
    </select>
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
