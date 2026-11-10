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

const SCOPES: readonly Scope[] = ['device', 'project'];
const NO_PENDING: PhaseSettingsMap = {};
const SETTINGS_TOPICS = ['settings'] as const;
const SCOPE_COLUMN_KEYS: Readonly<Record<Scope, string>> = { device: 'vsc.settings.colDevice', project: 'vsc.settings.colProject' };

function warningsOf(response: PhaseSettingsResponse | undefined): readonly ConfiguratorWarning[] {
  return response?.configurator_warnings ?? [];
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

interface PhaseCellProps {
  readonly phase: AvailablePhase;
  readonly scope: Scope;
  readonly isChecked: boolean;
  readonly isPending: boolean;
  readonly isBusy: boolean;
  readonly onToggle: (scope: Scope, id: string, enabled: boolean) => void;
}

function PhaseCell({ phase, scope, isChecked, isPending, isBusy, onToggle }: PhaseCellProps): JSX.Element {
  const t = useT();
  return (
    <td class={isPending ? 'gw-set-cell-pending' : undefined}>
      <Toggle
        checked={isChecked}
        disabled={phase.always_on || isBusy}
        ariaLabel={`${phase.name} — ${t(SCOPE_COLUMN_KEYS[scope])}`}
        onChange={(enabled) => onToggle(scope, phase.id, enabled)}
      />
    </td>
  );
}

function PhaseMatrix({ phases, saved }: MatrixProps): JSX.Element {
  const t = useT();
  const [pendingProject, setPendingProject] = useState<PhaseSettingsMap>(NO_PENDING);
  const [warnings, setWarnings] = useState<readonly ConfiguratorWarning[]>([]);
  useEffect(() => setPendingProject(NO_PENDING), [saved.project]);
  // Device defaults save on every toggle and project overrides save as a batch, matching the admin panel.
  const saveDevice = useMutation(putDevicePhaseSettings, { invalidates: SETTINGS_TOPICS, successToast: t('messages.phaseSettingsSaved') });
  const saveProject = useMutation(putProjectPhaseSettings, { invalidates: SETTINGS_TOPICS, successToast: t('messages.phaseSettingsSaved') });
  const hasPending = Object.keys(pendingProject).length > 0;
  const toggle = async (scope: Scope, id: string, enabled: boolean): Promise<void> => {
    if (scope === 'project') {
      setPendingProject(setPendingPhase(saved.project, pendingProject, id, enabled));
      return;
    }
    setWarnings(warningsOf(await saveDevice.run({ [id]: enabled })));
  };
  const submit = async (): Promise<void> => {
    setWarnings(warningsOf(await saveProject.run(pendingProject)));
  };
  const pendingFor = (scope: Scope): PhaseSettingsMap => (scope === 'project' ? pendingProject : NO_PENDING);
  if (phases.length === 0) {
    return <p class="gw-set-desc">{t('vsc.settings.noPhases')}</p>;
  }
  return (
    <>
      <p class="gw-set-desc">{t('config.phaseSettingsDesc')} {t('vsc.settings.phasesSaveHint')}</p>
      <WarningBanners warnings={warnings} />
      <table class="gw-set-matrix">
        <thead>
          <tr>
            <th>{t('vsc.settings.colPhase')}</th>
            {SCOPES.map((scope) => <th key={scope}>{t(SCOPE_COLUMN_KEYS[scope])}</th>)}
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
              {SCOPES.map((scope) => (
                <PhaseCell
                  key={scope}
                  phase={phase}
                  scope={scope}
                  isChecked={isPhaseEnabled(phase.always_on, phase.id, saved[scope], pendingFor(scope))}
                  isPending={phase.id in pendingFor(scope)}
                  isBusy={scope === 'device' && saveDevice.pending}
                  onToggle={(target, id, enabled) => void toggle(target, id, enabled)}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Toolbar align="end">
        <Button label={t('buttons.discardPhaseSettings')} disabled={!hasPending} onClick={() => setPendingProject(NO_PENDING)} />
        <Button variant="primary" icon="save" label={t('buttons.savePhaseSettings')} disabled={!hasPending} busy={saveProject.pending} onClick={submit} />
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
      <SubSection>
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
