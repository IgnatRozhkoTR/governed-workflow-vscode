import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { resolveProposal, type Proposal } from '../../api/reflection';
import { Badge, Button, Card, Collapsible, Markdown, StructuredValue, TextField, TimeAgo, Toolbar, useToast } from '../../components';
import { useT } from '../../i18n/i18n';
import { useMutation } from '../../store/hooks';
import { classNames } from '../../components/types';
import { applyPreview, buildResultJson, isLongProposalBody, isPending, parseJsonText, statusTone, type ApplyPreview } from './proposalsModel';

const RESOLVE_MUTATION = { invalidates: ['proposals'] } as const;

interface ProposalActions {
  readonly pending: boolean;
  markApplied(note: string): Promise<boolean>;
  reject(): Promise<boolean>;
}

type PendingDecision = 'apply' | 'reject';

// Marking applied only records the user's own change, so success is confirmed in words; the refreshed card then
// shows the executed status and folds away.
function useProposalActions(proposal: Proposal): ProposalActions {
  const t = useT();
  const toast = useToast();
  const resolve = useMutation((status: 'executed' | 'rejected', resultJson?: string) => resolveProposal(proposal.id, status, resultJson), RESOLVE_MUTATION);
  return {
    pending: resolve.pending,
    async markApplied(note) {
      const isRecorded = (await resolve.run('executed', buildResultJson(note))) !== undefined;
      if (isRecorded) {
        toast.success(t('vsc.reflection.markedApplied', { title: proposal.title }));
      }
      return isRecorded;
    },
    async reject() {
      return (await resolve.run('rejected')) !== undefined;
    },
  };
}

function Details({ label, source }: { readonly label: string; readonly source: string | null }): JSX.Element | null {
  const value = parseJsonText(source);
  return value === undefined ? null : <Collapsible summary={label}><StructuredValue value={value} /></Collapsible>;
}

function ProposalBody({ source }: { readonly source: string }): JSX.Element {
  const t = useT();
  const [isExpanded, setExpanded] = useState(false);
  const isLong = isLongProposalBody(source);
  return (
    <div class="gw-proposal-body">
      <div class={classNames(isLong && !isExpanded && 'gw-proposal-body-clamped')}>
        <Markdown source={source} mermaid compact />
      </div>
      {isLong && (
        <button type="button" class="gw-link gw-proposal-body-toggle" aria-expanded={isExpanded} onClick={() => setExpanded(!isExpanded)}>
          {t(isExpanded ? 'vsc.reflection.showLess' : 'vsc.reflection.showMore')}
        </button>
      )}
    </div>
  );
}

function ApplyPreviewView({ preview }: { readonly preview: ApplyPreview }): JSX.Element {
  const t = useT();
  if (preview.kind === 'payload') {
    return <StructuredValue value={preview.value} />;
  }
  if (preview.kind === 'body') {
    return <Markdown source={preview.source} compact />;
  }
  return <p class="gw-muted">{t('vsc.reflection.applyNoPreview')}</p>;
}

interface ApplyConfirmationProps {
  readonly proposal: Proposal;
  readonly actions: ProposalActions;
  readonly onClose: () => void;
}

function ApplyConfirmation({ proposal, actions, onClose }: ApplyConfirmationProps): JSX.Element {
  const t = useT();
  const [note, setNote] = useState('');
  const confirm = async (): Promise<void> => {
    if (await actions.markApplied(note)) {
      onClose();
    }
  };
  return (
    <div class="gw-proposal-confirm" role="group" aria-label={t('vsc.reflection.markAsApplied')}>
      <p class="gw-proposal-confirm-intro">{t('vsc.reflection.applyIntro')}</p>
      <div class="gw-proposal-confirm-preview">
        <ApplyPreviewView preview={applyPreview(proposal)} />
      </div>
      <TextField value={note} onInput={setNote} placeholder={t('vsc.reflection.resultPlaceholder')} ariaLabel={t('vsc.reflection.result')} multiline rows={2} disabled={actions.pending} autoFocus />
      <Toolbar align="end">
        <Button size="sm" label={t('vsc.common.cancel')} disabled={actions.pending} onClick={onClose} />
        <Button size="sm" variant="primary" icon="check" label={t('vsc.reflection.markAsApplied')} title={t('vsc.reflection.markAsAppliedHint')} busy={actions.pending} disabled={actions.pending} onClick={confirm} />
      </Toolbar>
    </div>
  );
}

// The server never moves a rejected proposal back to pending, so rejecting is confirmed like marking applied.
function RejectConfirmation({ actions, onClose }: Omit<ApplyConfirmationProps, 'proposal'>): JSX.Element {
  const t = useT();
  const confirm = async (): Promise<void> => {
    if (await actions.reject()) {
      onClose();
    }
  };
  return (
    <div class="gw-proposal-confirm" role="group" aria-label={t('proposals.reject')}>
      <p class="gw-proposal-confirm-intro">{t('vsc.reflection.rejectIntro')}</p>
      <Toolbar align="end">
        <Button size="sm" label={t('vsc.common.cancel')} disabled={actions.pending} onClick={onClose} autoFocus />
        <Button size="sm" variant="danger" icon="close" label={t('proposals.reject')} busy={actions.pending} disabled={actions.pending} onClick={confirm} />
      </Toolbar>
    </div>
  );
}

interface ProposalActionButtonsProps {
  readonly actions: ProposalActions;
  readonly decision: PendingDecision | undefined;
  readonly onDecide: (decision: PendingDecision) => void;
}

function ProposalActionButtons({ actions, decision, onDecide }: ProposalActionButtonsProps): JSX.Element {
  const t = useT();
  return (
    <span class="gw-proposal-actions">
      <Button size="sm" variant="primary" icon="check" label={t('vsc.reflection.markAsApplied')} title={t('vsc.reflection.markAsAppliedHint')} disabled={actions.pending || decision === 'apply'} onClick={() => onDecide('apply')} />
      <Button size="sm" icon="close" label={t('proposals.reject')} title={t('vsc.reflection.rejectHint')} disabled={actions.pending || decision === 'reject'} onClick={() => onDecide('reject')} />
    </span>
  );
}

interface DecisionConfirmationProps {
  readonly proposal: Proposal;
  readonly actions: ProposalActions;
  readonly decision: PendingDecision;
  readonly onClose: () => void;
}

function DecisionConfirmation({ proposal, actions, decision, onClose }: DecisionConfirmationProps): JSX.Element {
  return decision === 'apply'
    ? <ApplyConfirmation proposal={proposal} actions={actions} onClose={onClose} />
    : <RejectConfirmation actions={actions} onClose={onClose} />;
}

function ProposalBadges({ proposal }: { readonly proposal: Proposal }): JSX.Element {
  const t = useT();
  return (
    <>
      <Badge label={t(`proposals.type.${proposal.type}`)} />
      <Badge label={t(`proposals.kind.${proposal.implementation_kind}`)} />
      <Badge label={t(`proposals.status.${proposal.status}`)} tone={statusTone(proposal.status)} />
      <span class="gw-proposal-time"><TimeAgo iso={proposal.created_at} /></span>
      {proposal.reason !== null && proposal.reason !== '' && (
        <span class="gw-proposal-reason"><span class="gw-proposal-reason-label">{t('proposals.reason')}</span> {proposal.reason}</span>
      )}
    </>
  );
}

export function ProposalCard({ proposal }: { readonly proposal: Proposal }): JSX.Element {
  const t = useT();
  const actions = useProposalActions(proposal);
  const [decision, setDecision] = useState<PendingDecision | undefined>(undefined);
  const isAwaitingDecision = isPending(proposal);
  return (
    <div class="gw-proposal-item">
      <Card
        key={`${proposal.id}-${proposal.status}`}
        id={`proposal-${proposal.id}`}
        title={proposal.title}
        badge={<ProposalBadges proposal={proposal} />}
        actions={isAwaitingDecision ? <ProposalActionButtons actions={actions} decision={decision} onDecide={setDecision} /> : undefined}
        defaultCollapsed={!isAwaitingDecision}
      >
        <div class="gw-proposal">
          {proposal.body !== null && proposal.body !== '' && <ProposalBody source={proposal.body} />}
          <Details label={t('proposals.payload')} source={proposal.payload_json} />
          <Details label={t('vsc.reflection.result')} source={proposal.result_json} />
        </div>
      </Card>
      {isAwaitingDecision && decision !== undefined && <DecisionConfirmation key={decision} proposal={proposal} actions={actions} decision={decision} onClose={() => setDecision(undefined)} />}
    </div>
  );
}
