import type { JSX } from 'preact';
import { getProjectSettings, putProjectSettings, setReviewMode, type ProjectSettings } from '../../../api/settings';
import { RadioCards, ResourceView, Select } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useResource, useWorkspaceState } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { SectionShell, SettingRow, SubSection, useUndoableSave } from './parts';
import { DEFAULT_REVIEW_MODE, REVIEW_MODES } from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

const SETTINGS_TOPICS = ['settings'] as const;

function WorkspaceReviewMode(): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const save = useUndoableSave(setReviewMode, { refreshState: true });
  const current = state.review_mode ?? DEFAULT_REVIEW_MODE;
  return (
    <RadioCards
      value={current}
      options={REVIEW_MODES.map((mode) => ({ value: mode.value, title: t(mode.labelKey), description: t(mode.descriptionKey) }))}
      onChange={async (mode) => { await save.run(mode, current); }}
    />
  );
}

function ProjectDefaultMode({ settings, reload }: { readonly settings: ProjectSettings; readonly reload: () => void }): JSX.Element {
  const t = useT();
  const save = useUndoableSave(putProjectSettings, { invalidates: SETTINGS_TOPICS });
  const change = async (mode: string): Promise<void> => {
    const isSaved = await save.run({ review_mode_default: mode as ProjectSettings['review_mode_default'] }, { review_mode_default: settings.review_mode_default });
    if (!isSaved) {
      reload();
    }
  };
  return (
    <SettingRow label={t('settings.section.review.projectDefaultLabel')}>
      <Select
        value={settings.review_mode_default}
        ariaLabel={t('settings.section.review.projectDefaultLabel')}
        disabled={save.pending}
        options={REVIEW_MODES.map((mode) => ({ value: mode.value, label: t(mode.labelKey) }))}
        onChange={change}
      />
    </SettingRow>
  );
}

function ReviewModeSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const settings = useResource('settings', 'project', getProjectSettings, { active, refetchOnState: false });
  return (
    <SectionShell sectionKey="review" scope="workspace">
      <SubSection saveMode="instant">
        <WorkspaceReviewMode />
      </SubSection>
      <SubSection title={t('settings.section.review.projectDefaultTitle')} scope="project" saveMode="instant">
        <ResourceView resource={settings}>
          {(data) => <ProjectDefaultMode settings={data} reload={settings.reload} />}
        </ResourceView>
      </SubSection>
    </SectionShell>
  );
}

export const reviewModeSection: SettingsSectionModule = {
  id: 'reviewMode',
  titleKey: 'settings.nav.review',
  order: 40,
  messages: SETTINGS_MESSAGES,
  Component: ReviewModeSection,
};
