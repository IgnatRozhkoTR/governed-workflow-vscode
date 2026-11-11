import type { WorkspaceState } from '@api-types';
import { NOTIFY_MESSAGES, type NotifyKind } from '@shared/claudeMessages';
import {
  PLAN_APPROVAL_NAV, REVIEW_BLOCKING_NAV, attentionSignals, blockingThreadCount, isFinalPhase, isSameNav, needsAttentionNav, pendingGateNav,
  type AttentionSignals, type NavTarget,
} from '@shared/navigation';
import { isPlanAwaitingApproval } from '@shared/planStage';
import { LOCALES, isLocale, type Locale } from '@shared/protocol';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { notifyClaude, setLocale, setYolo } from '../api/core';
import { listPrs, type WorkspacePr } from '../api/git';
import { Badge, Button, Icon, Popover, Select, Toggle, useToast } from '../components';
import { gateTitle } from '../components/GateActions';
import { pluralKey } from '../components/plural';
import { classNames } from '../components/types';
import { useT } from '../i18n/i18n';
import { rpc } from '../rpc/rpcClient';
import { useAttentionCounts, type AttentionCounts } from '../store/attention';
import { useMutation, useNav, usePhaseLabel, useResource, useStore, useWorkspaceState } from '../store/hooks';
import { store } from '../store/store';
import { flashNavTarget } from './attentionFlash';
import { useResolvedBlockingCount, warningText } from './GateDigest';
import { threadsBlockerWarning } from './gateDigestModel';
import { requestDecisionFocus } from './decisionFocus';
import { HEADER_LABELS_MIN_WIDTH_PX, phaseChipName, useHeaderDensity, type HeaderDensity } from './layout';
import { useMenuFocus } from './menuFocus';
import { useTabTitle } from './tabTitles';
import { useRememberedNavigate } from './useRememberedNavigate';

type NativeMethod = 'native.resumeClaude' | 'native.showTerminal' | 'native.switchWorkspace';

const FAST_WORKFLOW_MODE = 'fast';
const LOCALE_OPTIONS = LOCALES.map((locale) => ({ value: locale, label: locale.toUpperCase() }));
const NOTIFY_CHOICES: readonly { readonly kind: NotifyKind; readonly labelKey: string }[] = [
  { kind: 'comments', labelKey: 'actions.notifyComments' },
  { kind: 'go', labelKey: 'actions.notifyGo' },
];

// Identity (branch, mode, phase, plan) shrinks and wraps on its own; the action cluster never shrinks and collapses
// to icons, then to an overflow menu, as the panel narrows. The two never overlap and the page never scrolls sideways.
export function Header(): JSX.Element {
  const state = useWorkspaceState();
  const branch = useStore((s) => s.workspace?.branch ?? state.branch);
  const [headerRef, density] = useHeaderDensity<HTMLElement>(HEADER_LABELS_MIN_WIDTH_PX);
  const isTicketFinished = isFinalPhase(state.phase, state.phase_sequence);
  return (
    <header ref={headerRef} class={classNames('gw-header', `gw-header-${density}`)}>
      <div class="gw-header-identity">
        <span class="gw-header-branch" title={`${branch}\n${state.working_dir}`}>{branch}</span>
        <WorkflowModeBadge mode={state.workflow_mode} />
        <PhaseChip state={state} density={density} />
        {isTicketFinished && <PullRequestLinks />}
      </div>
      <div class="gw-header-actions">
        <YoloToggle enabled={state.yolo_mode} />
        <HeaderActions density={density} locale={state.locale} isTicketFinished={isTicketFinished} />
      </div>
    </header>
  );
}

interface HeaderActionsProps {
  readonly density: HeaderDensity;
  readonly locale: string;
  readonly isTicketFinished: boolean;
}

// A finished ticket has no agent left to notify or resume, so those actions leave the header instead of staying live.
function HeaderActions({ density, locale, isTicketFinished }: HeaderActionsProps): JSX.Element {
  if (density === 'overflow') {
    return <OverflowMenu locale={locale} isTicketFinished={isTicketFinished} />;
  }
  const isIconOnly = density === 'compact';
  return (
    <>
      <NeedsAttentionButton isIconOnly={isIconOnly} />
      {!isTicketFinished && <NotifyMenu isIconOnly={isIconOnly} />}
      {!isTicketFinished && <ResumeButton isIconOnly={isIconOnly} />}
      <ShowTerminalButton />
      <SwitchButton isIconOnly={isIconOnly} />
      <LocaleSelect locale={locale} />
    </>
  );
}

interface AttentionJump {
  readonly target: NavTarget | undefined;
  readonly summary: string;
  jump(): void;
}

const ATTENTION_COUNT_KEYS: readonly (readonly [keyof AttentionCounts, string])[] = [
  ['pendingProposals', 'vsc.attention.pendingProposals'],
  ['openDiscussions', 'vsc.attention.openDiscussions'],
  ['pendingResearch', 'vsc.attention.pendingResearch'],
  ['openComments', 'vsc.attention.openComments'],
];

function useAttentionJump(): AttentionJump {
  const t = useT();
  const state = useWorkspaceState();
  const counts = useAttentionCounts();
  const signals = attentionSignals(state, counts.pendingProposals);
  const target = needsAttentionNav(signals);
  const lines = ATTENTION_COUNT_KEYS.filter(([key]) => counts[key] > 0).map(([key, messageKey]) => t(messageKey, { count: counts[key] }));
  const headline = t(target === undefined ? 'vsc.attention.nothing' : 'vsc.attention.goTo');
  const navigate = useRememberedNavigate();
  const announce = useAttentionAnnouncement(signals, counts.pendingProposals);
  // The jump scrolls to and flashes where it landed, even when the user is already there, so it never looks inert,
  // and says where it went, since the flash alone is easy to miss in a long tab.
  const jump = (): void => {
    if (target !== undefined) {
      navigate(target);
      flashNavTarget(target);
      announce(target);
    }
  };
  return { target, summary: [headline, ...lines].join('\n'), jump };
}

function useAttentionAnnouncement(signals: AttentionSignals, pendingProposals: number): (target: NavTarget) => void {
  const t = useT();
  const toast = useToast();
  const tabTitle = useTabTitle();
  const labelOf = usePhaseLabel();
  const resolvedButBlocking = useResolvedBlockingCount();
  const reasonFor = (target: NavTarget): string | undefined => {
    const gatePhase = signals.pendingGatePhase;
    if (gatePhase !== undefined) {
      return isSameNav(target, REVIEW_BLOCKING_NAV)
        ? warningText(t, threadsBlockerWarning(signals.blockingThreads, resolvedButBlocking))
        : gateTitle(t, labelOf, gatePhase);
    }
    if (signals.isPlanAwaitingApproval) {
      return t('vsc.decision.planTitle');
    }
    return signals.hasProposalsAwaitingReview ? t(pluralKey('vsc.decision.proposalsTitle', pendingProposals), { count: pendingProposals }) : undefined;
  };
  return (target) => {
    const place = tabTitle(target.tab);
    const reason = reasonFor(target);
    toast.info(reason === undefined ? t('vsc.attention.openedPlace', { place }) : t('vsc.attention.opened', { place, reason }));
  };
}

// With nothing waiting the button has nowhere to go, so it leaves the header rather than sitting there disabled.
function NeedsAttentionButton({ isIconOnly }: { readonly isIconOnly: boolean }): JSX.Element | null {
  const t = useT();
  const { target, summary, jump } = useAttentionJump();
  if (target === undefined) {
    return null;
  }
  return <Button size="sm" variant="ghost" icon="target" label={isIconOnly ? undefined : t('vsc.attention.label')} title={summary} onClick={jump} />;
}

// A finished ticket's outcome is its pull request, so the header links to it directly.
function PullRequestLinks(): JSX.Element | null {
  const prs = useResource('git', 'prs', listPrs);
  const list = prs.data?.prs ?? [];
  return list.length === 0 ? null : <>{list.map((pr) => <PullRequestLink key={pr.id} pr={pr} isNamed={list.length > 1} />)}</>;
}

function PullRequestLink({ pr, isNamed }: { readonly pr: WorkspacePr; readonly isNamed: boolean }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const label = isNamed && pr.name !== null ? t('vsc.header.openPrNamed', { name: pr.name }) : t('vsc.header.openPr');
  const open = (): void => {
    rpc.call('native.openExternal', { url: pr.url }).catch(toast.error);
  };
  return (
    <button type="button" class="gw-chip-button gw-header-pr" title={pr.title === null ? pr.url : `${pr.title}\n${pr.url}`} onClick={open}>
      <Icon name="git-pull-request" />
      <span>{label}</span>
    </button>
  );
}

function WorkflowModeBadge({ mode }: { readonly mode: string }): JSX.Element {
  const t = useT();
  return mode === FAST_WORKFLOW_MODE
    ? <Badge label={t('badges.fastMode')} tone="warning" />
    : <Badge label={t('badges.standardMode')} />;
}

// The phase chip names the phase only; a waiting decision adds a dot and leads to the decision bar, which says the rest.
function PhaseChip({ state, density }: { readonly state: WorkspaceState; readonly density: HeaderDensity }): JSX.Element {
  const decision = waitingDecisionNav(state);
  return decision === undefined ? <SetPhaseChip phase={state.phase} density={density} /> : <WaitingPhaseChip phase={state.phase} density={density} decision={decision} />;
}

function waitingDecisionNav(state: WorkspaceState): NavTarget | undefined {
  const gate = state.pending_gate ?? null;
  if (gate !== null) {
    return pendingGateNav(gate.phase, blockingThreadCount(state.comments));
  }
  return isPlanAwaitingApproval(state.plan, state.phase, state.plan_status) ? PLAN_APPROVAL_NAV : undefined;
}

function PhaseChipContent({ phase, density }: { readonly phase: string; readonly density: HeaderDensity }): JSX.Element {
  const phaseLabel = usePhaseLabel();
  const name = phaseChipName(phaseLabel(phase), density);
  return (
    <>
      <span class="gw-phase-id">{phase}</span>
      {name !== undefined && <span class="gw-header-phase-name">{name}</span>}
    </>
  );
}

function SetPhaseChip({ phase, density }: { readonly phase: string; readonly density: HeaderDensity }): JSX.Element {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const [nav, navigate] = useNav();
  const title = `${t('buttons.setPhase')}: ${phase} · ${phaseLabel(phase)}`;
  return (
    <button type="button" class="gw-chip-button gw-header-phase-chip" title={title} aria-label={title} onClick={() => navigate({ tab: nav.tab, section: nav.section, action: 'setPhase' })}>
      <PhaseChipContent phase={phase} density={density} />
    </button>
  );
}

// A waiting decision is taken in the pinned bar, so the chip opens the material and hands focus to the bar's Approve.
function WaitingPhaseChip({ phase, decision, density }: { readonly phase: string; readonly decision: NavTarget; readonly density: HeaderDensity }): JSX.Element {
  const t = useT();
  const phaseLabel = usePhaseLabel();
  const navigate = useRememberedNavigate();
  const title = `${phase} · ${phaseLabel(phase)}\n${t('vsc.header.decisionWaiting')}`;
  const openDecision = (): void => {
    navigate(decision);
    requestDecisionFocus();
  };
  return (
    <button type="button" class="gw-chip-button gw-header-phase-chip gw-header-phase-chip-waiting" title={title} aria-label={title} onClick={openDecision}>
      <PhaseChipContent phase={phase} density={density} />
      <span class="gw-header-phase-dot" aria-hidden="true" />
    </button>
  );
}

function YoloToggle({ enabled }: { readonly enabled: boolean }): JSX.Element {
  const t = useT();
  const toast = useToast();
  const toggle = useMutation(async (next: boolean) => {
    await setYolo(next);
    return next;
  }, { refreshState: true });
  const change = async (next: boolean): Promise<void> => {
    if ((await toggle.run(next)) !== undefined) {
      toast.success(t(next ? 'vsc.header.yoloOn' : 'vsc.header.yoloOff'));
    }
  };
  return <Toggle checked={enabled} label={t('config.yoloMode')} onChange={change} />;
}

interface NotifyAction {
  readonly pending: boolean;
  send(kind: NotifyKind): Promise<void>;
}

interface LocaleChangeAction {
  readonly pending: boolean;
  change(next: Locale): void;
}

function useNotify(): NotifyAction {
  const t = useT();
  const toast = useToast();
  const notify = useMutation((kind: NotifyKind) => notifyClaude(NOTIFY_MESSAGES[kind]));
  const send = async (kind: NotifyKind): Promise<void> => {
    if ((await notify.run(kind)) !== undefined) {
      toast.success(t('actions.notified'));
    }
  };
  return { pending: notify.pending, send };
}

function useNativeCall(): (method: NativeMethod) => Promise<void> {
  const toast = useToast();
  return (method) => rpc.call(method, {}).catch(toast.error);
}

function useLocaleChange(): LocaleChangeAction {
  const mutation = useMutation(async (next: Locale) => {
    await setLocale(next);
    await store.changeLocale(next);
  }, { refreshState: true });
  return { pending: mutation.pending, change: (next) => void mutation.run(next) };
}

function currentLocale(locale: string): Locale {
  return isLocale(locale) ? locale : store.getSnapshot().locale;
}

function NotifyMenu({ isIconOnly }: { readonly isIconOnly: boolean }): JSX.Element {
  const t = useT();
  const notify = useNotify();
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const send = (kind: NotifyKind): void => {
    setOpen(false);
    void notify.send(kind);
  };
  return (
    <span ref={setAnchor}>
      <Button size="sm" variant="ghost" icon="megaphone" label={isIconOnly ? undefined : t('actions.notify')} title={t('actions.notify')} busy={notify.pending} onClick={() => setOpen(!isOpen)} />
      <Popover open={isOpen} anchor={anchor} onClose={() => setOpen(false)}>
        <div class="gw-menu">
          {NOTIFY_CHOICES.map((choice) => (
            <button type="button" key={choice.kind} class="gw-menu-item" onClick={() => send(choice.kind)}>{t(choice.labelKey)}</button>
          ))}
        </div>
      </Popover>
    </span>
  );
}

function ResumeButton({ isIconOnly }: { readonly isIconOnly: boolean }): JSX.Element {
  const t = useT();
  const callNative = useNativeCall();
  return <Button size="sm" variant="ghost" icon="debug-continue" label={isIconOnly ? undefined : t('buttons.resume')} title={t('buttons.resume')} onClick={() => callNative('native.resumeClaude')} />;
}

function ShowTerminalButton(): JSX.Element {
  const t = useT();
  const callNative = useNativeCall();
  return <Button size="sm" variant="ghost" icon="terminal" title={t('vsc.header.showTerminal')} onClick={() => callNative('native.showTerminal')} />;
}

function SwitchButton({ isIconOnly }: { readonly isIconOnly: boolean }): JSX.Element {
  const t = useT();
  const callNative = useNativeCall();
  return <Button size="sm" variant="ghost" icon="arrow-swap" label={isIconOnly ? undefined : t('header.switch')} title={t('header.switch')} onClick={() => callNative('native.switchWorkspace')} />;
}

function LocaleSelect({ locale }: { readonly locale: string }): JSX.Element {
  const t = useT();
  const localeChange = useLocaleChange();
  return (
    <Select
      value={currentLocale(locale)}
      options={LOCALE_OPTIONS}
      disabled={localeChange.pending}
      title={t('vsc.header.language')}
      onChange={(next) => isLocale(next) && localeChange.change(next)}
    />
  );
}

// The mutations live here, not in the popover body, so their busy state survives the menu closing.
function OverflowMenu({ locale, isTicketFinished }: { readonly locale: string; readonly isTicketFinished: boolean }): JSX.Element {
  const t = useT();
  const notify = useNotify();
  const localeChange = useLocaleChange();
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [isOpen, setOpen] = useState(false);
  const runAndClose = (action: () => void): void => {
    setOpen(false);
    action();
  };
  // Escape removes the focused menu item, so focus goes back to the trigger instead of falling to the page body.
  const focusTrigger = (): void => anchor?.querySelector<HTMLButtonElement>('button')?.focus();
  return (
    <span ref={setAnchor}>
      <OverflowTrigger isOpen={isOpen} isBusy={notify.pending || localeChange.pending} onToggle={() => setOpen(!isOpen)} />
      <Popover open={isOpen} anchor={anchor} onClose={() => setOpen(false)}>
        <OverflowMenuItems locale={currentLocale(locale)} isTicketFinished={isTicketFinished} notify={notify} localeChange={localeChange} runAndClose={runAndClose} onEscape={focusTrigger} />
      </Popover>
    </span>
  );
}

interface OverflowTriggerProps {
  readonly isOpen: boolean;
  readonly isBusy: boolean;
  readonly onToggle: () => void;
}

// Icon-only, so it names itself for screen readers as well as in its tooltip, and reports the menu it opens.
function OverflowTrigger({ isOpen, isBusy, onToggle }: OverflowTriggerProps): JSX.Element {
  const t = useT();
  const label = t('vsc.header.moreActions');
  return (
    <button
      type="button"
      class="gw-button gw-button-ghost gw-button-sm gw-button-icon-only"
      title={label}
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      aria-busy={isBusy}
      disabled={isBusy}
      onClick={onToggle}
    >
      <Icon name={isBusy ? 'loading' : 'ellipsis'} spin={isBusy} />
    </button>
  );
}

interface OverflowMenuItemsProps {
  readonly locale: Locale;
  readonly isTicketFinished: boolean;
  readonly notify: NotifyAction;
  readonly localeChange: LocaleChangeAction;
  readonly runAndClose: (action: () => void) => void;
  readonly onEscape: () => void;
}

function OverflowMenuItems({ locale, isTicketFinished, notify, localeChange, runAndClose, onEscape }: OverflowMenuItemsProps): JSX.Element {
  const t = useT();
  const callNative = useNativeCall();
  const attention = useAttentionJump();
  const { menuRef, handleKeyDown } = useMenuFocus();
  const handleMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      runAndClose(() => undefined);
    } else if (event.key === 'Escape') {
      onEscape();
    } else {
      handleKeyDown(event);
    }
  };
  return (
    <div ref={menuRef} class="gw-menu" role="menu" aria-label={t('vsc.header.moreActions')} onKeyDown={handleMenuKeyDown}>
      {attention.target !== undefined && (
        <MenuItem icon="target" label={t('vsc.attention.label')} title={attention.summary} onSelect={() => runAndClose(attention.jump)} />
      )}
      {!isTicketFinished && (
        <>
          <div class="gw-menu-label">{t('actions.notify')}</div>
          {NOTIFY_CHOICES.map((choice) => (
            <MenuItem key={choice.kind} icon="megaphone" label={t(choice.labelKey)} onSelect={() => runAndClose(() => void notify.send(choice.kind))} />
          ))}
          <MenuItem icon="debug-continue" label={t('buttons.resume')} onSelect={() => runAndClose(() => void callNative('native.resumeClaude'))} />
          <MenuItem icon="terminal" label={t('vsc.header.showTerminal')} onSelect={() => runAndClose(() => void callNative('native.showTerminal'))} />
        </>
      )}
      <MenuItem icon="arrow-swap" label={t('header.switch')} onSelect={() => runAndClose(() => void callNative('native.switchWorkspace'))} />
      <div class="gw-menu-label">{t('vsc.header.language')}</div>
      {LOCALE_OPTIONS.map((option) => (
        <MenuItem key={option.value} icon={option.value === locale ? 'check' : 'blank'} label={option.label} isChecked={option.value === locale} onSelect={() => runAndClose(() => option.value !== locale && localeChange.change(option.value))} />
      ))}
    </div>
  );
}

interface MenuItemProps {
  readonly icon: string;
  readonly label: string;
  readonly title?: string;
  readonly isChecked?: boolean;
  readonly onSelect: () => void;
}

function MenuItem({ icon, label, title, isChecked, onSelect }: MenuItemProps): JSX.Element {
  return (
    <button type="button" tabIndex={-1} class="gw-menu-item gw-header-menu-item" title={title} role={isChecked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={isChecked} onClick={onSelect}>
      <Icon name={icon} />
      <span>{label}</span>
    </button>
  );
}
