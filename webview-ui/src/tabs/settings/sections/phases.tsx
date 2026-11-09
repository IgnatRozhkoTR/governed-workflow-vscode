import type { AvailablePhase } from '@api-types';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getAvailablePhases } from '../../../api/core';
import {
  getDevicePhaseSettings,
  getProjectPhaseSettings,
  putDevicePhaseSettings,
  putProjectPhaseSettings,
  type ConfiguratorWarning,
  type PhaseSettingsMap,
  type PhaseSettingsResponse,
} from '../../../api/settings';
import { Badge, Button, ErrorBanner, ResourceView, Spinner, Toggle, Toolbar } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useMutation, useResource } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { SectionShell, SubSection, WarningBanners } from './parts';
import { isPhaseEnabled, setPendingPhase } from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

type Scope = 'device' | 'project';
type PendingByScope = Record<Scope, PhaseSettingsMap>;

const NO_PENDING: PendingByScope = { device: {}, project: {} };
const SETTINGS_TOPICS = ['settings'] as const;

interface SaveOutcome {
  readonly warnings: readonly ConfiguratorWarning[];
}

async function savePending(pending: PendingByScope): Promise<SaveOutcome> {
  const responses: PhaseSettingsResponse[] = [];
  if (Object.keys(pending.device).length > 0) {
    responses.push(await putDevicePhaseSettings(pending.device));
  }
  if (Object.keys(pending.project).length > 0) {
    responses.push(await putProjectPhaseSettings(pending.project));
  }
  return { warnings: responses.flatMap((response) => response.configurator_warnings ?? []) };
}

function PhaseBadges({ phase }: { readonly phase: AvailablePhase }): JSX.Element {
  const t = useT();
  return (
    <>
      {phase.always_on && <Badge label={t('labels.alwaysOn')} tone="neutral" />}
      {phase.is_user_gate && <Badge label={t('labels.userGate')} tone="warning" icon="account" />}
      {phase.templated && <Badge label={t('labels.perSubPhase')} tone="info" />}
    </>
  );
}

interface MatrixProps {
  readonly phases: readonly AvailablePhase[];
  readonly saved: Record<Scope, PhaseSettingsMap>;
}

function PhaseMatrix({ phases, saved }: MatrixProps): JSX.Element {
  const t = useT();
  const [pending, setPending] = useState<PendingByScope>(NO_PENDING);
  const [warnings, setWarnings] = useState<readonly ConfiguratorWarning[]>([]);
  useEffect(() => setPending(NO_PENDING), [saved.device, saved.project]);
  const save = useMutation(savePending, { invalidates: SETTINGS_TOPICS, successToast: t('messages.phaseSettingsSaved') });
  const hasPending = Object.keys(pending.device).length + Object.keys(pending.project).length > 0;
  const toggle = (scope: Scope, id: string, enabled: boolean): void => {
    setPending({ ...pending, [scope]: setPendingPhase(saved[scope], pending[scope], id, enabled) });
  };
  const submit = async (): Promise<void> => {
    const outcome = await save.run(pending);
    setWarnings(outcome?.warnings ?? []);
  };
  if (phases.length === 0) {
    return <p class="gw-set-desc">{t('vsc.settings.noPhases')}</p>;
  }
  return (
    <>
      <p class="gw-set-desc">{t('config.phaseSettingsDesc')}</p>
      <WarningBanners warnings={warnings} />
      <table class="gw-set-matrix">
        <thead>
          <tr>
            <th>{t('vsc.settings.colPhase')}</th>
            <th>{t('vsc.settings.colDevice')}</th>
            <th>{t('vsc.settings.colProject')}</th>
          </tr>
        </thead>
        <tbody>
          {phases.map((phase) => (
            <tr key={phase.id}>
              <td>
                <span class="gw-set-phase-name">{phase.name}</span>
                {phase.name !== phase.id && <span class="gw-set-phase-id">{phase.id}</span>}
                <PhaseBadges phase={phase} />
              </td>
              {(['device', 'project'] as const).map((scope) => (
                <td key={scope} class={phase.id in pending[scope] ? 'gw-set-cell-pending' : undefined}>
                  <Toggle
                    checked={isPhaseEnabled(phase.always_on, phase.id, saved[scope], pending[scope])}
                    disabled={phase.always_on}
                    onChange={(enabled) => toggle(scope, phase.id, enabled)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Toolbar align="end">
        <Button label={t('buttons.discardPhaseSettings')} disabled={!hasPending} onClick={() => setPending(NO_PENDING)} />
        <Button variant="primary" icon="save" label={t('buttons.savePhaseSettings')} disabled={!hasPending} busy={save.pending} onClick={submit} />
      </Toolbar>
    </>
  );
}

function PhasesSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const options = { active, refetchOnState: false } as const;
  const available = useResource('phases', 'available-full', getAvailablePhases, options);
  const device = useResource('settings', 'phase-device', getDevicePhaseSettings, options);
  const project = useResource('settings', 'phase-project', getProjectPhaseSettings, options);
  const error = device.error ?? project.error;
  return (
    <SectionShell sectionKey="phases" scope="project">
      <SubSection title={t('cards.phaseSettings')}>
        {error !== undefined && <ErrorBanner error={error} onRetry={() => { device.reload(); project.reload(); }} />}
        <ResourceView resource={available}>
          {(phases) =>
            device.data !== undefined && project.data !== undefined
              ? <PhaseMatrix phases={phases.phases} saved={{ device: device.data.settings, project: project.data.settings }} />
              : <Spinner />}
        </ResourceView>
      </SubSection>
    </SectionShell>
  );
}

export const phasesSection: SettingsSectionModule = {
  id: 'phases',
  titleKey: 'settings.nav.phases',
  order: 30,
  messages: SETTINGS_MESSAGES,
  Component: PhasesSection,
};
