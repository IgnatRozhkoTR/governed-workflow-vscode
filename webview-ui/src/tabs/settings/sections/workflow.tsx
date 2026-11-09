import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { setYolo } from '../../../api/core';
import {
  getAdvanceModes,
  getProjectSettings,
  putAdvanceModes,
  putProjectSettings,
  setWorkflowMode,
  type AdvanceModes,
  type ProjectSettings,
} from '../../../api/settings';
import { Button, RadioCards, ResourceView, Select, Toggle, Toolbar, useDialogs, useToast } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useMutation, useResource, useWorkspaceState } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { SectionShell, SettingRow, SubSection } from './parts';
import {
  ADVANCE_BOUNDARIES,
  ADVANCE_MODE_OPTIONS,
  effectiveAdvanceMode,
  setPendingAdvanceMode,
  validateAdvanceModes,
} from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

const SETTINGS_TOPICS = ['settings'] as const;

function WorkflowModeCard(): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const toast = useToast();
  const state = useWorkspaceState();
  const mode = useMutation(setWorkflowMode, { refreshState: true });
  const yolo = useMutation(setYolo, { refreshState: true, successToast: t('settings.saved') });
  const change = async (next: string): Promise<void> => {
    const isFast = next === 'fast';
    const isConfirmed = await dialogs.confirm({
      title: t(isFast ? 'badges.fastMode' : 'badges.standardMode'),
      message: t(isFast ? 'config.fastModeConfirm' : 'config.standardModeConfirm'),
    });
    if (isConfirmed && (await mode.run(next)) !== undefined) {
      toast.success(t(isFast ? 'messages.fastModeEnabled' : 'messages.fastModeDisabled'));
    }
  };
  return (
    <>
      <RadioCards
        value={state.workflow_mode}
        onChange={change}
        options={[
          { value: 'fast', title: t('vsc.settings.modeFastTitle'), description: t('vsc.settings.modeFastDesc') },
          { value: 'standard', title: t('vsc.settings.modeStandardTitle'), description: t('vsc.settings.modeStandardDesc') },
        ]}
      />
      <SettingRow label={t('config.yoloMode')} description={t('settings.section.workflow.yoloDesc')}>
        <Toggle checked={state.yolo_mode} onChange={async (enabled) => { await yolo.run(enabled); }} />
      </SettingRow>
    </>
  );
}

function ProjectDefaults({ settings, reload }: { readonly settings: ProjectSettings; readonly reload: () => void }): JSX.Element {
  const t = useT();
  const save = useMutation(putProjectSettings, { invalidates: SETTINGS_TOPICS, successToast: t('settings.saved') });
  const update = async (patch: Parameters<typeof putProjectSettings>[0]): Promise<void> => {
    if ((await save.run(patch)) === undefined) {
      reload();
    }
  };
  return (
    <>
      <SettingRow label={t('config.fastModeDefault')} description={t('config.fastModeDefaultDesc')}>
        <Toggle checked={settings.fast_mode_default} onChange={(value) => update({ fast_mode_default: value })} />
      </SettingRow>
      <SettingRow label={t('config.yoloModeDefault')} description={t('config.yoloModeDefaultDesc')}>
        <Toggle checked={settings.yolo_mode_default} onChange={(value) => update({ yolo_mode_default: value })} />
      </SettingRow>
    </>
  );
}

function AdvanceModeRows({ saved }: { readonly saved: AdvanceModes }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [pending, setPending] = useState<AdvanceModes>({});
  useEffect(() => setPending({}), [saved]);
  const save = useMutation(putAdvanceModes, { invalidates: SETTINGS_TOPICS, successToast: t('settings.saved') });
  const hasPending = Object.keys(pending).length > 0;
  const submit = async (): Promise<void> => {
    const problem = validateAdvanceModes(pending);
    if (problem !== undefined) {
      toast.error(new Error(t('messages.failedToSave', { error: problem })));
      return;
    }
    await save.run(pending);
  };
  return (
    <>
      <p class="gw-set-desc">{t('advanceModes.desc')}</p>
      <div class="gw-set-rows">
        {ADVANCE_BOUNDARIES.map((boundary) => {
          const value = effectiveAdvanceMode(saved, pending, boundary.key);
          const option = ADVANCE_MODE_OPTIONS.find((candidate) => candidate.value === value);
          return (
            <div key={boundary.key} class={`gw-set-row${boundary.key in pending ? ' gw-set-row-pending' : ''}`}>
              <div class="gw-set-row-text">
                <div class="gw-set-row-label">
                  {t(boundary.labelKey)}
                  {boundary.key in pending && <span class="gw-set-dot" title={t('vsc.settings.unsaved')} />}
                </div>
                <div class="gw-set-row-desc">{t(boundary.descriptionKey)}</div>
                {option !== undefined && <div class="gw-set-row-hint">{t(option.titleKey)}</div>}
              </div>
              <div class="gw-set-row-control">
                <Select
                  value={value}
                  options={ADVANCE_MODE_OPTIONS.map((candidate) => ({ value: candidate.value, label: t(candidate.labelKey) }))}
                  onChange={(next) => setPending(setPendingAdvanceMode(saved, pending, boundary.key, next))}
                />
              </div>
            </div>
          );
        })}
      </div>
      <Toolbar align="end">
        <Button variant="primary" icon="save" label={t('buttons.save')} disabled={!hasPending} busy={save.pending} onClick={submit} />
      </Toolbar>
    </>
  );
}

function WorkflowSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const projectSettings = useResource('settings', 'project', getProjectSettings, { active, refetchOnState: false });
  const advanceModes = useResource('settings', 'advance', getAdvanceModes, { active, refetchOnState: false });
  return (
    <SectionShell sectionKey="workflow" scope="workspace">
      <SubSection title={t('cards.workflowMode')} scope="workspace">
        <WorkflowModeCard />
      </SubSection>
      <SubSection title={t('settings.section.workflow.projectDefaultsTitle')} scope="project">
        <ResourceView resource={projectSettings}>
          {(data) => <ProjectDefaults settings={data} reload={projectSettings.reload} />}
        </ResourceView>
      </SubSection>
      <SubSection title={t('cards.advanceModes')} scope="project">
        <ResourceView resource={advanceModes}>{(data) => <AdvanceModeRows saved={data} />}</ResourceView>
      </SubSection>
    </SectionShell>
  );
}

export const workflowSection: SettingsSectionModule = {
  id: 'workflow',
  titleKey: 'settings.nav.workflow',
  order: 20,
  messages: SETTINGS_MESSAGES,
  Component: WorkflowSection,
};
