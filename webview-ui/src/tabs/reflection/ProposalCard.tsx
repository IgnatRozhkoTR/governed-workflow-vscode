import type { JSX } from 'preact';
import { resolveProposal, type Proposal } from '../../api/reflection';
import { Badge, Button, Card, Collapsible, Markdown, StructuredValue, TimeAgo, Toolbar, useDialogs } from '../../components';
import { useT } from '../../i18n/i18n';
import { useMutation } from '../../store/hooks';
import { buildResultJson, isPending, parseJsonText, statusTone } from './proposalsModel';

const RESOLVE_MUTATION = { invalidates: ['proposals'] } as const;

function useProposalActions(proposal: Proposal): { readonly pending: boolean; markApplied(): Promise<void>; reject(): Promise<void> } {
  const t = useT();
  const dialogs = useDialogs();
  const resolve = useMutation((status: 'executed' | 'rejected', resultJson?: string) => resolveProposal(proposal.id, status, resultJson), RESOLVE_MUTATION);
  return {
    pending: resolve.pending,
    async markApplied() {
      const note = await dialogs.prompt({ title: t('proposals.markApplied'), message: proposal.title, placeholder: t('vsc.reflection.resultPlaceholder'), multiline: true, confirmLabel: t('proposals.markApplied') });
      if (note !== undefined) {
        await resolve.run('executed', buildResultJson(note));
      }
    },
    async reject() {
      await resolve.run('rejected');
    },
  };
}

function Details({ label, source }: { readonly label: string; readonly source: string | null }): JSX.Element | null {
  const value = parseJsonText(source);
  return value === undefined ? null : <Collapsible summary={label}><StructuredValue value={value} /></Collapsible>;
}

export function ProposalCard({ proposal }: { readonly proposal: Proposal }): JSX.Element {
  const t = useT();
  const actions = useProposalActions(proposal);
  const badges = (
    <>
      <Badge label={t(`proposals.type.${proposal.type}`)} />
      <Badge label={t(`proposals.kind.${proposal.implementation_kind}`)} tone="info" />
      <Badge label={t(`proposals.status.${proposal.status}`)} tone={statusTone(proposal.status)} />
    </>
  );
  return (
    <Card id={`proposal-${proposal.id}`} title={proposal.title} badge={badges}>
      <div class="gw-proposal">
        {proposal.body !== null && proposal.body !== '' && <Markdown source={proposal.body} mermaid />}
        {proposal.reason !== null && proposal.reason !== '' && (
          <div class="gw-proposal-reason"><span class="gw-field-label">{t('proposals.reason')}</span> {proposal.reason}</div>
        )}
        <Details label={t('proposals.payload')} source={proposal.payload_json} />
        <Details label={t('vsc.reflection.result')} source={proposal.result_json} />
        <Toolbar align="between">
          <TimeAgo iso={proposal.created_at} />
          {isPending(proposal) && (
            <span class="gw-proposal-actions">
              <Button size="sm" variant="primary" icon="check" label={t('proposals.markApplied')} disabled={actions.pending} onClick={actions.markApplied} />
              <Button size="sm" icon="close" label={t('proposals.reject')} disabled={actions.pending} onClick={actions.reject} />
            </span>
          )}
        </Toolbar>
      </div>
    </Card>
  );
}
