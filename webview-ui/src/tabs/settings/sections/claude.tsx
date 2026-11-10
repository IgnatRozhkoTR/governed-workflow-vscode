import type { JSX } from 'preact';
import { getCommandConfig, putCommandConfig, type CommandConfig } from '../../../api/settings';
import { Button, ResourceView, TextField, Toggle, Toolbar } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useMutation, useResource } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { Field, SectionShell, SettingRow, useDraft } from './parts';
import { diffCommandConfig } from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

const COMMAND_TOPICS = ['settings'] as const;
const ENV_ROWS = 5;
const DEFAULT_COMMAND = 'claude';

function CommandForm({ saved }: { readonly saved: CommandConfig }): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useDraft(saved);
  const save = useMutation(putCommandConfig, { invalidates: COMMAND_TOPICS, refreshState: true, successToast: t('settings.saved') });
  const patch = diffCommandConfig(saved, draft);
  const isDirty = Object.keys(patch).length > 0;
  const edit = (change: Partial<CommandConfig>): void => setDraft({ ...draft, ...change });
  return (
    <div class="gw-set-form">
      <Field label={t('config.commandLabel')}>
        <TextField value={draft.claude_command} placeholder={DEFAULT_COMMAND} onInput={(claude_command) => edit({ claude_command })} />
      </Field>
      <SettingRow label={t('config.skipPermissions')} description={draft.skip_permissions ? t('vsc.settings.skipPermissionsWarning') : undefined}>
        <Toggle checked={draft.skip_permissions} ariaLabel={t('config.skipPermissions')} onChange={(skip_permissions) => edit({ skip_permissions })} />
      </SettingRow>
      <SettingRow label={t('config.restrictToWorkspace')}>
        <Toggle checked={draft.restrict_to_workspace} ariaLabel={t('config.restrictToWorkspace')} onChange={(restrict_to_workspace) => edit({ restrict_to_workspace })} />
      </SettingRow>
      <Field label={t('config.externalPaths')}>
        <TextField value={draft.allowed_external_paths} placeholder="/tmp/, /var/log/" onInput={(allowed_external_paths) => edit({ allowed_external_paths })} />
        <span class="gw-set-row-hint">{t('vsc.settings.commandHint')}</span>
      </Field>
      <Field label={t('config.envVars')}>
        <div class="gw-set-mono">
          <TextField multiline rows={ENV_ROWS} value={draft.env_vars} placeholder={'API_KEY=sk-...\nDEBUG=1'} onInput={(env_vars) => edit({ env_vars })} />
        </div>
      </Field>
      <Toolbar align="end">
        <Button label={t('buttons.discardPhaseSettings')} disabled={!isDirty} onClick={() => setDraft(saved)} />
        <Button variant="primary" icon="save" label={t('buttons.save')} disabled={!isDirty} busy={save.pending} onClick={() => save.run(patch).then(() => undefined)} />
      </Toolbar>
    </div>
  );
}

function ClaudeSection({ active }: { readonly active: boolean }): JSX.Element {
  const command = useResource('settings', 'command', getCommandConfig, { active, refetchOnState: false });
  return (
    <SectionShell sectionKey="claude" scope="workspace">
      <ResourceView resource={command}>{(data) => <CommandForm saved={data} />}</ResourceView>
    </SectionShell>
  );
}

export const claudeSection: SettingsSectionModule = {
  id: 'claude',
  titleKey: 'settings.nav.claude',
  order: 80,
  messages: SETTINGS_MESSAGES,
  Component: ClaudeSection,
};
