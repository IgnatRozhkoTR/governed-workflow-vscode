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

const DEFAULT_SUBPATH = '.';
const BLOCKING = 'blocking';
const INVALIDATE_VERIFICATION = { invalidates: ['verification'] } as const;

const MESSAGES: ModuleMessages = {
  en: {
    'vsc.verification.unassignConfirm': 'Remove profile "{name}" from this project?',
    'vsc.verification.subpath': 'Subpath (default: .)',
  },
  ru: {
    'vsc.verification.unassignConfirm': 'Убрать профиль «{name}» из этого проекта?',
    'vsc.verification.subpath': 'Подпуть (по умолчанию: .)',
  },
};

function StepRow({ step }: { readonly step: VerificationStep }): JSX.Element {
  const toggle = useMutation((enabled: boolean) => setStepEnabled(step.id, enabled), INVALIDATE_VERIFICATION);
  return (
    <div class="gw-verification-config-step">
      <Toggle checked={step.enabled === 1} label={step.name} onChange={async (enabled) => { await toggle.run(enabled); }} />
      <Badge label={step.fail_severity} tone={step.fail_severity === BLOCKING ? 'danger' : 'warning'} />
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
    <Card title={profile.name} badge={subpathBadge} actions={<Button size="sm" variant="danger" icon="trash" label={t('verification.remove')} busy={unassign.pending} onClick={remove} />}>
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
      <Select value={profileId} options={choices} onChange={setProfileId} />
      <TextField value={subpath} onInput={setSubpath} placeholder={t('vsc.verification.subpath')} onSubmit={() => void submit()} />
      <Button variant="primary" icon="add" label={t('verification.assign')} disabled={profileId === ''} busy={assign.pending} onClick={submit} />
    </div>
  );
}

function VerificationSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const profiles = useResource('verification', 'profiles', async () => ({ all: await listAllProfiles(), assigned: await listWorkspaceProfiles() }), { active, refetchOnState: false });
  return (
    <div class="gw-verification-settings">
      <p class="gw-muted">{t('settings.section.verification.desc')}</p>
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
  );
}

export const verificationSection: SettingsSectionModule = {
  id: 'verification',
  titleKey: 'settings.nav.verification',
  order: 50,
  messages: MESSAGES,
  Component: VerificationSection,
};
