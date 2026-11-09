import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  getEnabledModules,
  getNetworkMode,
  listModules,
  restartServer,
  setEnabledModules,
  setNetworkMode,
  type ConfiguratorWarning,
  type ModuleInfo,
  type NetworkModeInfo,
} from '../../../api/settings';
import { Badge, Button, ResourceView, Toggle, Toolbar, useDialogs, useToast } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { useMutation, useResource } from '../../../store/hooks';
import type { SettingsSectionModule } from '../../types';
import { SectionShell, SettingRow, SubSection, useDraft, WarningBanners } from './parts';
import { sameSet, toggleModule } from './settingsLogic';
import { SETTINGS_MESSAGES } from './settingsMessages';

const SETTINGS_TOPICS = ['settings'] as const;
const SERVER_PORT = 5111;

function NetworkModeCard({ info }: { readonly info: NetworkModeInfo }): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const toast = useToast();
  const [isRestartPending, setRestartPending] = useState(false);
  const save = useMutation(setNetworkMode, { invalidates: SETTINGS_TOPICS, successToast: t('settings.saved') });
  const restart = async (): Promise<void> => {
    try {
      await restartServer();
      setRestartPending(false);
      toast.info(t('vsc.settings.restarting'));
    } catch (error) {
      toast.error(error);
    }
  };
  const askRestart = async (): Promise<void> => {
    setRestartPending(true);
    const isConfirmed = await dialogs.confirm({
      title: t('vsc.settings.restartTitle'),
      message: t('vsc.settings.restartMessage'),
      confirmLabel: t('vsc.settings.restartNow'),
    });
    if (isConfirmed) {
      await restart();
    }
  };
  const change = async (enabled: boolean): Promise<void> => {
    const isConfirmed = await dialogs.confirm({
      title: t(enabled ? 'vsc.settings.networkEnableTitle' : 'vsc.settings.networkDisableTitle'),
      message: `${t('networkMode.explain')}\n\n${t('vsc.settings.networkWarning')}`,
      danger: enabled,
    });
    if (isConfirmed && (await save.run(enabled)) !== undefined) {
      await askRestart();
    }
  };
  return (
    <>
      <SettingRow label={t('networkMode.allowAccess')} description={t('networkMode.explain')}>
        <Toggle checked={info.network_enabled} onChange={change} />
      </SettingRow>
      <p class="gw-set-desc">{t('vsc.settings.networkWarning')}</p>
      {info.network_enabled && (
        <div class="gw-set-chips">
          <span class="gw-set-row-desc">{t('networkMode.reach')}</span>
          {info.lan_ips.length === 0
            ? <em>{t('networkMode.noLan')}</em>
            : info.lan_ips.map((ip) => <code key={ip} class="gw-set-chip">{`http://${ip}:${SERVER_PORT}`}</code>)}
        </div>
      )}
      {isRestartPending && (
        <Toolbar align="between">
          <Badge tone="warning" icon="warning" label={t('vsc.settings.restartPending')} />
          <Button icon="debug-restart" label={t('vsc.settings.restartNow')} onClick={restart} />
        </Toolbar>
      )}
    </>
  );
}

function ModulesForm({ modules, enabled }: { readonly modules: readonly ModuleInfo[]; readonly enabled: readonly string[] }): JSX.Element {
  const t = useT();
  const [draft, setDraft] = useDraft(enabled);
  const [warnings, setWarnings] = useState<readonly ConfiguratorWarning[]>([]);
  const save = useMutation(setEnabledModules, { invalidates: SETTINGS_TOPICS, successToast: t('settings.saved') });
  const isDirty = !sameSet(draft, enabled);
  const submit = async (): Promise<void> => {
    const result = await save.run(draft);
    setWarnings(result?.configurator_warnings ?? []);
  };
  return (
    <>
      <WarningBanners warnings={warnings} />
      {modules.map((module) => (
        <SettingRow key={module.id} label={module.name} description={module.description === '' ? undefined : module.description}>
          <Toggle checked={draft.includes(module.id)} onChange={(isOn) => setDraft(toggleModule(draft, module.id, isOn))} />
        </SettingRow>
      ))}
      <Toolbar align="end">
        <Button variant="primary" icon="save" label={t('vsc.settings.saveModules')} disabled={!isDirty} busy={save.pending} onClick={submit} />
      </Toolbar>
    </>
  );
}

function SystemSection({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const options = { active, refetchOnState: false } as const;
  const network = useResource('settings', 'network', getNetworkMode, options);
  const modules = useResource('settings', 'modules', listModules, options);
  const enabled = useResource('settings', 'modules-enabled', getEnabledModules, options);
  return (
    <SectionShell sectionKey="system" scope="device">
      <SubSection title={t('networkMode.title')}>
        <ResourceView resource={network}>{(info) => <NetworkModeCard info={info} />}</ResourceView>
      </SubSection>
      <SubSection title={t('settings.section.system.modulesTitle')}>
        <ResourceView resource={modules} empty={(list) => list.length === 0} emptyMessage={t('vsc.settings.noModules')}>
          {(list) => (
            <ResourceView resource={enabled}>{(ids) => <ModulesForm modules={list} enabled={ids} />}</ResourceView>
          )}
        </ResourceView>
      </SubSection>
    </SectionShell>
  );
}

export const systemSection: SettingsSectionModule = {
  id: 'system',
  titleKey: 'settings.nav.system',
  order: 90,
  messages: SETTINGS_MESSAGES,
  Component: SystemSection,
};
