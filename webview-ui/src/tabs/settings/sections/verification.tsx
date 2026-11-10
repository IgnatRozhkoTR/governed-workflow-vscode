import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  assignProfile, listAllProfiles, listWorkspaceProfiles, setStepEnabled, unassignProfile,
  type AssignedProfile, type VerificationProfile, type VerificationStep,
} from '../../../api/verification';
import { Badge, Button, Card, EmptyState, ResourceView, Select, TextField, Toggle, useDialogs } from '../../../components';
import { useT, type ModuleMessages } from '../../../i18n/i18n';
import { useMutation, useResource } from '../../../store/hooks';
import { availableProfiles } from '../../phase/verificationModel';
import type { SettingsSectionModule } from '../../types';
import { SectionShell, useUndoableSave } from './parts';

const DEFAULT_SUBPATH = '.';
const BLOCKING = 'blocking';
const KNOWN_SEVERITIES: readonly string[] = [BLOCKING, 'warning'];
const INVALIDATE_VERIFICATION = { invalidates: ['verification'] } as const;

const MESSAGES: ModuleMessages = {
  en: {
    'vsc.verification.unassignConfirm': 'Remove profile "{name}" from this project?',
    'vsc.verification.subpath': 'Subpath (default: .)',
    'vsc.verification.profile': 'Verification profile',
    'vsc.verification.severity.blocking': 'Blocking',
    'vsc.verification.severity.warning': 'Warning',
  },
  ru: {
    'vsc.verification.unassignConfirm': 'Убрать профиль «{name}» из этого проекта?',
    'vsc.verification.subpath': 'Подпуть (по умолчанию: .)',
    'vsc.verification.profile': 'Профиль проверки',
    'vsc.verification.severity.blocking': 'Блокирующий',
    'vsc.verification.severity.warning': 'Предупреждение',
  },
};

function severityLabel(translate: (key: string) => string, severity: string): string {
  return KNOWN_SEVERITIES.includes(severity) ? translate(`vsc.verification.severity.${severity}`) : severity;
}

function StepRow({ step }: { readonly step: VerificationStep }): JSX.Element {
  const t = useT();
  const toggle = useUndoableSave((enabled: boolean) => setStepEnabled(step.id, enabled), INVALIDATE_VERIFICATION);
  const isEnabled = step.enabled === 1;
  return (
    <div class="gw-verification-config-step">
      <Toggle checked={isEnabled} label={step.name} onChange={async (enabled) => { await toggle.run(enabled, isEnabled); }} />
      <Badge label={severityLabel(t, step.fail_severity)} tone={step.fail_severity === BLOCKING ? 'danger' : 'warning'} />
      <code class="gw-verification-command">{step.command}</code>
    </div>
  );
}

function AssignedProfileCard({ profile }: { readonly profile: AssignedProfile }): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const unassign = useMutation(() => unassignProfile(profile.assignment_id), INVALIDATE_VERIFICATION);
  const remove = async (): Promise<void> => {
    if (await dialogs.confirm({ title: t('verification.remove'), message: t('vsc.verification.unassignConfirm', { name: profile.name }), confirmLabel: t('verification.remove'), danger: true })) {
      await unassign.run();
    }
  };
  const subpathBadge = profile.subpath === DEFAULT_SUBPATH ? undefined : <Badge label={profile.subpath} icon="folder" />;
  return (
    <Card id={`verification-profile-${profile.assignment_id}`} title={profile.name} badge={subpathBadge} actions={<Button size="sm" icon="trash" label={t('verification.remove')} busy={unassign.pending} onClick={() => void remove()} />}>
      {profile.steps.map((step) => <StepRow key={step.id} step={step} />)}
    </Card>
  );
}

function AssignRow({ options }: { readonly options: readonly VerificationProfile[] }): JSX.Element {
  const t = useT();
  const [profileId, setProfileId] = useState('');
  const [subpath, setSubpath] = useState('');
  const assign = useMutation((id: number, path: string) => assignProfile(id, path), INVALIDATE_VERIFICATION);
  const submit = async (): Promise<void> => {
    const result = await assign.run(Number(profileId), subpath.trim() || DEFAULT_SUBPATH);
    if (result !== undefined) {
      setProfileId('');
      setSubpath('');
    }
  };
  const choices = [{ value: '', label: t('verification.selectProfile') }, ...options.map((profile) => ({ value: String(profile.id), label: `${profile.name} (${profile.language})` }))];
  return (
    <div class="gw-verification-assign">
      <Select value={profileId} options={choices} onChange={setProfileId} ariaLabel={t('vsc.verification.profile')} />
      <TextField value={subpath} onInput={setSubpath} placeholder={t('vsc.verification.subpath')} ariaLabel={t('vsc.verification.subpath')} onSubmit={() => void submit()} />
      <Button variant="primary" icon="add" label={t('verification.assign')} disabled={profileId === ''} busy={assign.pending} onClick={submit} />
    </div>
  );
}

function VerificationSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const profiles = useResource('verification', 'profiles', async () => ({ all: await listAllProfiles(), assigned: await listWorkspaceProfiles() }), { active, refetchOnState: false });
  return (
    <SectionShell sectionKey="verification" scope="project">
      <div class="gw-verification-settings">
        <ResourceView resource={profiles}>
          {({ all, assigned }) => (
            <>
              {assigned.length === 0
                ? <EmptyState icon="beaker" message={t('verification.noProfiles')} />
                : assigned.map((profile) => <AssignedProfileCard key={profile.assignment_id} profile={profile} />)}
              <AssignRow options={availableProfiles(all, assigned)} />
            </>
          )}
        </ResourceView>
      </div>
    </SectionShell>
  );
}

export const verificationSection: SettingsSectionModule = {
  id: 'verification',
  titleKey: 'settings.nav.verification',
  order: 50,
  messages: MESSAGES,
  Component: VerificationSection,
};
