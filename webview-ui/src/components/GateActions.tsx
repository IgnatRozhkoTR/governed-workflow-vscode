import type { GateResult, PendingGate } from '@api-types';
import { blockingThreadCount } from '@shared/navigation';
import type { JSX } from 'preact';
import { approveGate, rejectGate } from '../api/core';
import { suggestedCommitMessage } from '../shell/commitMessage';
import { approveLabelKind } from '../shell/gateLabels';
import { useT, type t as translate } from '../i18n/i18n';
import { useMutation, useNav, usePhaseLabel, useStore } from '../store/hooks';
import { Button } from './Button';
import { useDialogs, type DialogNotice } from './DialogHost';
import { createExclusiveLock, detach } from './exclusiveLock';
import { pluralKey } from './plural';
import { toasts } from './ToastHost';

export interface GateActionsProps {
  readonly gate: PendingGate;
}

export interface GateCopy {
  readonly titleKey: string;
  readonly descriptionKey: string | undefined;
  readonly approveKey: string;
  readonly rejectKey: string;
  readonly rejectTarget: string | undefined;
}

type Translate = typeof translate;

const GATE_MUTATION = { refreshState: true } as const;
const NO_PHASES: readonly string[] = [];
const COMMIT_APPROVAL_PATTERN = /^(3\.\d+)\.3$/;
const FINAL_APPROVAL_PHASE = '4.2';
const DONE_PHASE = '6';

// Titles, descriptions and approve labels are the web's _PHASE_GATE_CONFIGS keys (phase.js), except the final gate:
// approving it does not finish the ticket but releases it for delivery (reflection, then push and PR), so its button,
// tooltip and dialog say "ship"; send-back labels are this extension's own, one verb for every gate; reject targets
// mirror the server gates.
const GATE_COPY: Readonly<Record<string, GateCopy>> = {
  '1.4': {
    titleKey: 'phaseAction.preplanningReview',
    descriptionKey: 'phaseAction.preplanningReviewDesc',
    approveKey: 'preplanning.approvePreplanning',
    rejectKey: 'vsc.gate.sendBackResearch',
    rejectTarget: '1.1',
  },
  '2.1': {
    titleKey: 'phaseAction.planReview',
    descriptionKey: 'phaseAction.planReviewDesc',
    approveKey: 'buttons.approvePlan',
    rejectKey: 'vsc.gate.sendBackPlanning',
    rejectTarget: '2.0',
  },
  '4.2': {
    titleKey: 'phaseAction.finalApproval',
    descriptionKey: 'phaseAction.finalApprovalDesc',
    approveKey: 'vsc.gate.approveShip',
    rejectKey: 'vsc.gate.sendBackFixes',
    rejectTarget: '4.1',
  },
};

const UNKNOWN_GATE_COPY: GateCopy = {
  titleKey: 'vsc.phase.gateWaiting',
  descriptionKey: undefined,
  approveKey: 'buttons.approve',
  rejectKey: 'vsc.gate.sendBack',
  rejectTarget: undefined,
};

export function gateCopy(phase: string): GateCopy {
  const commitApproval = COMMIT_APPROVAL_PATTERN.exec(phase);
  if (commitApproval !== null) {
    return {
      titleKey: 'phaseAction.codeReview',
      descriptionKey: 'phaseAction.codeReviewDesc',
      approveKey: 'buttons.approveChanges',
      rejectKey: 'vsc.gate.sendBackFixes',
      rejectTarget: `${commitApproval[1]}.2`,
    };
  }
  return GATE_COPY[phase] ?? UNKNOWN_GATE_COPY;
}

// A code review is named exactly as the header's phase chip names its step ("Discount engine — Code Review"), so the
// two never read in a different order.
export function gateTitle(t: Translate, labelOf: (phase: string) => string, phase: string): string {
  return COMMIT_APPROVAL_PATTERN.test(phase) ? labelOf(phase) : t(gateCopy(phase).titleKey, { phase: labelOf(phase) });
}

export function nextPhaseInSequence(sequence: readonly string[], phase: string): string | undefined {
  const index = sequence.indexOf(phase);
  return index < 0 ? undefined : sequence[index + 1];
}

export function approveConfirmMessage(t: Translate, labelOf: (phase: string) => string, gatePhase: string, nextPhase: string | undefined): string {
  if (gatePhase === FINAL_APPROVAL_PHASE) {
    return shipConfirmMessage(t, labelOf, nextPhase);
  }
  return nextPhase === undefined
    ? t('vsc.gate.approveConfirm', { phase: labelOf(gatePhase) })
    : t('vsc.phase.approveConfirmTarget', { phase: labelOf(gatePhase), target: phaseWithName(nextPhase, labelOf) });
}

// The last approval: whatever runs next (reflection, unless it is turned off), the agent then pushes and opens the PR.
function shipConfirmMessage(t: Translate, labelOf: (phase: string) => string, nextPhase: string | undefined): string {
  return nextPhase === undefined || nextPhase === DONE_PHASE
    ? t('vsc.gate.shipConfirmDone')
    : t('vsc.gate.shipConfirm', { target: phaseWithName(nextPhase, labelOf) });
}

function rejectQuestion(t: Translate, labelOf: (phase: string) => string, rejectTarget: string | undefined): string {
  return rejectTarget === undefined
    ? t('vsc.gate.sendBack')
    : t('vsc.gate.rejectConfirm', { target: phaseWithName(rejectTarget, labelOf) });
}

// The open review threads are already the feedback, so the note is optional and the dialog says they go back too.
export function sendBackMessage(question: string, openThreads: string | undefined): string {
  return openThreads === undefined ? question : `${question} ${openThreads}`;
}

function phaseWithName(phase: string, labelOf: (phase: string) => string): string {
  const name = labelOf(phase);
  return name === phase ? phase : `${phase} · ${name}`;
}

// The pinned decision bar is the only place that approves, rejects or reports a waiting gate, so a gate card keeps
// only the actions that are not the decision itself.
export function GateActions(_props: GateActionsProps): JSX.Element {
  const t = useT();
  const [nav, navigate] = useNav();
  return (
    <div class="gw-gate-status">
      <Button size="sm" variant="ghost" icon="edit" label={t('buttons.setPhase')} title={t('phase.overrideTitle')} onClick={() => navigate({ tab: nav.tab, section: nav.section, action: 'setPhase' })} />
    </div>
  );
}

export interface GateDecisionButtonsProps extends GateActionsProps {
  readonly approvalNotices?: readonly DialogNotice[];
  // What the server will refuse the approval on; while any is present Approve leads to them instead of posting.
  readonly approvalBlockers?: readonly DialogNotice[];
  readonly blockingCount?: number;
  readonly isNarrow?: boolean;
}

const NO_NOTICES: readonly DialogNotice[] = [];

// The bar has no room for the commit and feedback fields, so it asks for them in the confirm dialog itself.
// A gate that commits says so with its icon and tooltip; a hint beside the buttons would cost the digest its chips.
export function GateDecisionButtons({ gate, approvalNotices = NO_NOTICES, approvalBlockers = NO_NOTICES, blockingCount = 0, isNarrow = false }: GateDecisionButtonsProps): JSX.Element {
  const copy = gateCopy(gate.phase);
  const decision = useGateDecision(gate, copy, approvalNotices);
  const approve = useApproveButton(gate, copy, approvalBlockers, blockingCount);
  const reject = useRejectLabels(copy, isNarrow);
  return (
    <>
      <Button size="sm" variant={approve.variant} icon={approve.icon} label={approve.label} title={approve.title} busy={decision.isApproving} disabled={decision.isSubmitting} onClick={approve.isBlocked ? detach(approve.showBlockers) : detach(decision.approve)} />
      <Button size="sm" variant="danger" icon="close" label={reject.label} title={reject.title} busy={decision.isRejecting} disabled={decision.isSubmitting} onClick={detach(decision.reject)} />
    </>
  );
}

interface ApproveButton {
  readonly label: string;
  readonly title: string;
  readonly icon: string;
  readonly variant: 'primary' | 'secondary';
  readonly isBlocked: boolean;
  showBlockers(): Promise<void>;
}

// A refused approval is stated before the click: the label counts the blockers, the button turns secondary with a
// lock, and clicking it opens the first blocker and says why rather than posting an approval the server would reject.
function useApproveButton(gate: PendingGate, copy: GateCopy, blockers: readonly DialogNotice[], blockingCount: number): ApproveButton {
  const t = useT();
  const serverLabel = t(copy.approveKey);
  const kind = approveLabelKind({ phase: gate.phase, serverLabel, blockingCount });
  const showBlockers = async (): Promise<void> => {
    blockers[0]?.onOpen();
    toasts.info(`${t('vsc.gate.approvalBlocked')} ${blockers.map((blocker) => blocker.text).join('; ')}`);
  };
  if (kind === 'blocked') {
    const title = blockers.map((blocker) => blocker.text).join('\n');
    return { label: t('vsc.gate.approveBlocking', { count: blockingCount }), title, icon: 'lock', variant: 'secondary', isBlocked: true, showBlockers };
  }
  const label = { ship: t('vsc.gate.approveShip'), server: serverLabel, short: t('buttons.approve') }[kind];
  const icon = gate.accepts_commit_message ? 'git-commit' : 'check';
  const title = gate.accepts_commit_message ? `${t('vsc.gate.approveAndCommit', { action: serverLabel })}\n${t('vsc.gate.commitHint')}` : serverLabel;
  return { label, title, icon, variant: 'primary', isBlocked: false, showBlockers };
}

interface RejectLabels {
  readonly label: string;
  readonly title: string;
}

// The tooltip names the target in full, since the label only hints at where the work goes, and a narrow bar drops even the hint.
function useRejectLabels(copy: GateCopy, isNarrow: boolean): RejectLabels {
  const t = useT();
  const labelOf = usePhaseLabel();
  const fullLabel = t(copy.rejectKey);
  const label = isNarrow ? t('vsc.gate.sendBack') : fullLabel;
  const title = copy.rejectTarget === undefined ? fullLabel : t('vsc.gate.sendBackTo', { target: phaseWithName(copy.rejectTarget, labelOf) });
  return { label, title };
}

interface GateDecision {
  readonly isSubmitting: boolean;
  readonly isApproving: boolean;
  readonly isRejecting: boolean;
  approve(): Promise<void>;
  reject(): Promise<void>;
}

// Every entry point to a gate decision shares one lock, so a second click can never stack another confirm or POST.
const gateDecisionLock = createExclusiveLock();

function useGateDecision(gate: PendingGate, copy: GateCopy, approvalNotices: readonly DialogNotice[]): GateDecision {
  const t = useT();
  const labelOf = usePhaseLabel();
  const dialogs = useGateDialogs(gate, copy, approvalNotices);
  const approveMutation = useMutation((message: string | undefined) => approveGate(message), GATE_MUTATION);
  const rejectMutation = useMutation((comments: string) => rejectGate(comments), GATE_MUTATION);
  const isSubmitting = gateDecisionLock.useIsSubmitting();
  const report = (result: GateResult | undefined, key: string): void => {
    if (result !== undefined) {
      toasts.success(t(key, { phase: labelOf(result.phase) }));
    }
  };
  return {
    isSubmitting,
    isApproving: approveMutation.pending,
    isRejecting: rejectMutation.pending,
    approve: () => gateDecisionLock.run(async (submit) => {
      const commitMessage = await dialogs.askApproval();
      if (commitMessage !== undefined) {
        report(await submit(() => approveMutation.run(commitMessage === '' ? undefined : commitMessage)), 'messages.approved');
      }
    }),
    reject: () => gateDecisionLock.run(async (submit) => {
      const feedback = await dialogs.askRejectionFeedback();
      if (feedback !== undefined) {
        report(await submit(() => rejectMutation.run(feedback)), 'messages.rejected');
      }
    }),
  };
}

interface GateDialogs {
  askApproval(): Promise<string | undefined>;
  askRejectionFeedback(): Promise<string | undefined>;
}

function useGateDialogs(gate: PendingGate, copy: GateCopy, notices: readonly DialogNotice[]): GateDialogs {
  const t = useT();
  const labelOf = usePhaseLabel();
  const dialogs = useDialogs();
  const sequence = useStore((s) => s.state?.phase_sequence ?? NO_PHASES);
  const openThreads = useStore((s) => (s.state === null ? 0 : blockingThreadCount(s.state.comments)));
  const openThreadsText = openThreads > 0 ? t(pluralKey('vsc.gate.threadsSentBack', openThreads), { count: openThreads }) : undefined;
  const approveMessage = approveConfirmMessage(t, labelOf, gate.phase, nextPhaseInSequence(sequence, gate.phase));
  const suggestion = useStore((s) => (s.state === null ? '' : suggestedCommitMessage(s.state.plan, gate.phase)));
  const askCommitMessage = async (): Promise<string | undefined> => (await dialogs.prompt({
    title: t(copy.approveKey),
    message: suggestion === '' ? approveMessage : `${approveMessage} ${t('vsc.gate.commitSuggestionNote')}`,
    notices,
    placeholder: t('vsc.gate.commitMessagePlaceholder'),
    fieldLabel: t('vsc.gate.commitMessageLabel'),
    initialValue: suggestion,
    multiline: true,
    confirmLabel: t(copy.approveKey),
  }))?.trim();
  const confirmApproval = async (): Promise<string | undefined> => (
    (await dialogs.confirm({ title: t(copy.approveKey), message: approveMessage, notices, confirmLabel: t(copy.approveKey) })) ? '' : undefined
  );
  return {
    askApproval: () => (gate.accepts_commit_message ? askCommitMessage() : confirmApproval()),
    askRejectionFeedback: async () => (await dialogs.prompt({
      title: t(copy.rejectKey),
      message: sendBackMessage(rejectQuestion(t, labelOf, copy.rejectTarget), openThreadsText),
      placeholder: t('vsc.gate.feedbackPlaceholder'),
      fieldLabel: t('vsc.gate.feedbackLabel'),
      multiline: true,
      confirmLabel: t(copy.rejectKey),
      danger: true,
    }))?.trim(),
  };
}
