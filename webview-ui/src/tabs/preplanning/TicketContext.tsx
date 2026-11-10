import type { WorkspaceContext } from '@api-types';
import type { JSX } from 'preact';
import { getContext } from '../../api/preplanning';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CodeRef } from '../../components/CodeRef';
import { Markdown } from '../../components/Markdown';
import { ResourceView } from '../../components/ResourceView';
import { useT } from '../../i18n/i18n';
import { useNav, useResource } from '../../store/hooks';

function ticketHeading(data: WorkspaceContext): string {
  return [data.ticket_id, data.ticket_name].filter((part) => part !== '').join(' — ');
}

function TicketBody({ data }: { readonly data: WorkspaceContext }): JSX.Element {
  const t = useT();
  const openableRefs = data.refs.filter((ref) => !ref.endsWith('/'));
  return (
    <div class="gw-pp-ticket">
      {data.context === '' ? <p class="gw-pp-ticket-empty">{t('vsc.preplanning.noTicketContext')}</p> : <Markdown source={data.context} compact />}
      {openableRefs.length > 0 && <div class="gw-pp-ticket-refs">{openableRefs.map((ref) => <CodeRef key={ref} path={ref} />)}</div>}
    </div>
  );
}

export function TicketContext({ active }: { readonly active: boolean }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const context = useResource('context', 'preplanning', getContext, { active, refetchOnState: false });
  const heading = context.data === undefined ? '' : ticketHeading(context.data);
  return (
    <Card
      id="preplanning-ticket"
      title={t('vsc.preplanning.ticket')}
      subtitle={heading === '' ? undefined : heading}
      collapsedPreview={context.data?.context.trim().split('\n')[0]}
      defaultCollapsed
      actions={<Button size="sm" variant="ghost" icon="edit" label={t('vsc.preplanning.editTicket')} onClick={() => navigate({ tab: 'settings', section: 'task' })} />}
    >
      <ResourceView resource={context}>{(data) => <TicketBody data={data} />}</ResourceView>
    </Card>
  );
}
