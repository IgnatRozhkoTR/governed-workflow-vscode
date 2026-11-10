import type { WorkspaceState } from '@api-types';
import type { JSX } from 'preact';
import { getHistory } from '../../api/changes';
import { listPrs, type WorkspacePr } from '../../api/git';
import { listProposals } from '../../api/reflection';
import { Card, KeyValueList, useToast } from '../../components';
import { useT } from '../../i18n/i18n';
import { describeError, formatDate, shortenUrl } from '../../lib/format';
import { rpc } from '../../rpc/rpcClient';
import { usePhaseLabel, useResource, type Resource } from '../../store/hooks';
import type { TicketDates } from './summaryModel';
import { countProposals, countThreads, splitDuration, ticketDates, ticketSpan } from './summaryModel';

const MULTI_REPO_PROJECT = 'multi';

function ResourceValue<T>({ resource, render }: { readonly resource: Resource<T>; readonly render: (data: T) => JSX.Element | string }): JSX.Element {
  const t = useT();
  if (resource.error !== undefined) {
    return <span class="gw-progress-summary-error" title={describeError(resource.error)}>{t('vsc.progress.summaryUnavailable')}</span>;
  }
  return <>{resource.data === undefined ? '…' : render(resource.data)}</>;
}

function PrLinks({ prs }: { readonly prs: readonly WorkspacePr[] }): JSX.Element {
  const t = useT();
  const toast = useToast();
  if (prs.length === 0) {
    return <span class="gw-muted">{t('gitCockpit.prs.empty')}</span>;
  }
  const open = (url: string): void => {
    rpc.call('native.openExternal', { url }).catch((error: unknown) => toast.error(error));
  };
  return (
    <span class="gw-progress-summary-prs">
      {prs.map((pr) => <button key={pr.id} type="button" class="gw-link" title={pr.url} onClick={() => open(pr.url)}>{pr.title || shortenUrl(pr.url)}</button>)}
    </span>
  );
}

function CommitCount(): JSX.Element {
  const history = useResource('history', 'summary.commits', () => getHistory({}));
  return <ResourceValue resource={history} render={(data) => String(data.commits.length)} />;
}

function formatDuration(t: ReturnType<typeof useT>, durationMs: number): string {
  const { days, hours, minutes } = splitDuration(durationMs);
  return [days > 0 ? t('vsc.progress.durationDays', { count: days }) : '', hours > 0 ? t('vsc.progress.durationHours', { count: hours }) : '', days === 0 && minutes > 0 ? t('vsc.progress.durationMinutes', { count: minutes }) : '']
    .filter((part) => part !== '')
    .join(' ');
}

function finishedRows(t: ReturnType<typeof useT>, dates: TicketDates): { label: string; value: string }[] {
  const span = ticketSpan(dates);
  if (!span.showFinished || dates.finishedAt === undefined) {
    return [];
  }
  const finished = formatDate(dates.finishedAt);
  const rows = [{ label: t('vsc.progress.summaryFinished'), value: finished }];
  return span.durationMs === undefined ? rows : [...rows, { label: t('vsc.progress.summaryDuration'), value: formatDuration(t, span.durationMs) }];
}

export function TicketSummaryCard({ state }: { readonly state: WorkspaceState }): JSX.Element {
  const t = useT();
  const label = usePhaseLabel();
  const prs = useResource('git', 'prs', listPrs);
  const proposals = useResource('proposals', 'list', () => listProposals());
  const dates = ticketDates(state);
  const threads = countThreads(state.comments);
  const isMultiRepo = state.project_type === MULTI_REPO_PROJECT;
  const items = [
    { label: t('vsc.progress.summaryPhase'), value: label(state.phase) },
    { label: t('vsc.progress.summaryStarted'), value: dates.startedAt === undefined ? '—' : formatDate(dates.startedAt) },
    ...finishedRows(t, dates),
    { label: t('gitCockpit.prs.title'), value: <ResourceValue resource={prs} render={(data) => <PrLinks prs={data.prs} />} /> },
    // Multi-repo workspaces have no single history to count, so the commit row is shown only for single-repo projects.
    ...(isMultiRepo ? [] : [{ label: t('vsc.progress.summaryCommits'), value: <CommitCount /> }]),
    { label: t('vsc.progress.summaryThreads'), value: t('vsc.progress.summaryThreadCounts', { total: threads.total, resolved: threads.resolved }) },
    {
      label: t('vsc.progress.summaryProposals'),
      value: <ResourceValue resource={proposals} render={(data) => t('vsc.progress.summaryProposalCounts', { ...countProposals(data.proposals) })} />,
    },
  ];
  return (
    <Card id="progress-summary" title={t('vsc.progress.summaryTitle')} persistKey="progress-summary">
      <KeyValueList items={items} />
    </Card>
  );
}
