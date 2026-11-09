import type { JSX } from 'preact';
import { getProjectSettings, putProjectSettings, setReviewMode, type ProjectSettings } from '../../../api/settings';
import { RadioCards, ResourceView, Select } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useMutation, useResource, useWorkspaceState } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { SectionShell, SettingRow, SubSection } from './parts';
import { DEFAULT_REVIEW_MODE, REVIEW_MODES } from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

const SETTINGS_TOPICS = ['settings'] as const;

function WorkspaceReviewMode(): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const save = useMutation(setReviewMode, { refreshState: true, successToast: t('settings.saved') });
  return (
    <RadioCards
      value={state.review_mode ?? DEFAULT_REVIEW_MODE}
      options={REVIEW_MODES.map((mode) => ({ value: mode.value, title: t(mode.labelKey), description: t(mode.descriptionKey) }))}
      onChange={async (mode) => { await save.run(mode); }}
    />
  );
}

function ProjectDefaultMode({ settings, reload }: { readonly settings: ProjectSettings; readonly reload: () => void }): JSX.Element {
  const t = useT();
  const save = useMutation(putProjectSettings, { invalidates: SETTINGS_TOPICS, successToast: t('settings.saved') });
  const change = async (mode: string): Promise<void> => {
    if ((await save.run({ review_mode_default: mode as ProjectSettings['review_mode_default'] })) === undefined) {
      reload();
    }
  };
  return (
    <SettingRow label={t('settings.section.review.projectDefaultLabel')}>
      <Select
        value={settings.review_mode_default}
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
      <WorkspaceReviewMode />
      <SubSection title={t('settings.section.review.projectDefaultTitle')} scope="project">
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
