import type { WorkspaceState } from '@api-types';
import { NOTIFY_MESSAGES, type NotifyKind } from '@shared/claudeMessages';
import { LOCALES, isLocale, type Locale } from '@shared/protocol';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { notifyClaude, setLocale, setYolo } from '../api/core';
import { Badge, Button, Popover, Select, Toggle, useToast } from '../components';
import { loadLocaleMessages, useT } from '../i18n/i18n';
import { rpc } from '../rpc/rpcClient';
import { useMutation, useNav, usePhaseLabel, useStore, useWorkspaceState } from '../store/hooks';
import { store } from '../store/store';

const FAST_WORKFLOW_MODE = 'fast';
const LOCALE_OPTIONS = LOCALES.map((locale) => ({ value: locale, label: locale.toUpperCase() }));
const NOTIFY_CHOICES: readonly { readonly kind: NotifyKind; readonly labelKey: string }[] = [
  { kind: 'comments', labelKey: 'actions.notifyComments' },
  { kind: 'go', labelKey: 'actions.notifyGo' },
];

export function Header(): JSX.Element {
  const state = useWorkspaceState();
  const branch = useStore((s) => s.workspace?.branch ?? state.branch);
  return (
    <header class="gw-header">
      <div class="gw-header-identity">
        <span class="gw-header-branch" title={state.working_dir}>{branch}</span>
        <WorkflowModeBadge mode={state.workflow_mode} />
        <PhaseChip state={state} />
      </div>
      <div class="gw-header-actions">
        <YoloToggle enabled={state.yolo_mode} />
        <NotifyMenu />
        <ClaudeButtons />
        <LocaleSelect locale={state.locale} />
      </div>
    </header>
  );
}

function WorkflowModeBadge({ mode }: { readonly mode: string }): JSX.Element {
  const t = useT();
  return mode === FAST_WORKFLOW_MODE
    ? <Badge label={t('badges.fastMode')} tone="warning" />
    : <Badge label={t('badges.standardMode')} />;
}

function PhaseChip({ state }: { readonly state: WorkspaceState }): JSX.Element {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const [nav, navigate] = useNav();
  return (
    <span class="gw-header-phase">
      <button type="button" class="gw-chip-button" title={t('buttons.setPhase')} onClick={() => navigate({ tab: nav.tab, section: nav.section, action: 'setPhase' })}>
        <span class="gw-phase-id">{state.phase}</span>
        <span>{phaseLabel(state.phase)}</span>
      </button>
      {state.pending_gate !== null && <Badge icon="bell" tone="accent" label={phaseLabel(state.pending_gate.phase)} title={t('vsc.header.gateWaiting')} />}
      {state.plan_status !== null && <Badge icon="checklist" tone={planTone(state.plan_status)} label={t(`badges.${state.plan_status}`)} />}
    </span>
  );
}

function planTone(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'approved') {
    return 'success';
  }
  return status === 'rejected' ? 'danger' : 'warning';
}

function YoloToggle({ enabled }: { readonly enabled: boolean }): JSX.Element {
  const t = useT();
  const toggle = useMutation((next: boolean) => setYolo(next), { refreshState: true });
  return <Toggle checked={enabled} label={t('config.yoloMode')} onChange={async (next) => { await toggle.run(next); }} />;
}

function NotifyMenu(): JSX.Element {
  const t = useT();
  const toast = useToast();
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const notify = useMutation((kind: NotifyKind) => notifyClaude(NOTIFY_MESSAGES[kind]));
  const send = async (kind: NotifyKind): Promise<void> => {
    setOpen(false);
    if ((await notify.run(kind)) !== undefined) {
      toast.success(t('actions.notified'));
    }
  };
  return (
    <span ref={setAnchor}>
      <Button size="sm" icon="megaphone" label={t('actions.notify')} busy={notify.pending} onClick={() => setOpen(!isOpen)} />
      <Popover open={isOpen} anchor={anchor} onClose={() => setOpen(false)}>
        <div class="gw-menu">
          {NOTIFY_CHOICES.map((choice) => (
            <button type="button" key={choice.kind} class="gw-menu-item" onClick={() => void send(choice.kind)}>{t(choice.labelKey)}</button>
          ))}
        </div>
      </Popover>
    </span>
  );
}

function ClaudeButtons(): JSX.Element {
  const t = useT();
  const toast = useToast();
  const callNative = (method: 'native.resumeClaude' | 'native.switchWorkspace'): Promise<void> => rpc.call(method, {}).catch(toast.error);
  return (
    <>
      <Button size="sm" icon="debug-continue" label={t('buttons.resume')} onClick={() => callNative('native.resumeClaude')} />
      <Button size="sm" variant="ghost" icon="arrow-swap" label={t('header.switch')} onClick={() => callNative('native.switchWorkspace')} />
    </>
  );
}

function LocaleSelect({ locale }: { readonly locale: string }): JSX.Element {
  const change = useMutation(async (next: Locale) => {
    await setLocale(next);
    await loadLocaleMessages(next);
    store.setLocale(next);
  }, { refreshState: true });
  return (
    <Select
      value={isLocale(locale) ? locale : store.getSnapshot().locale}
      options={LOCALE_OPTIONS}
      disabled={change.pending}
      onChange={(next) => isLocale(next) && void change.run(next)}
    />
  );
}
