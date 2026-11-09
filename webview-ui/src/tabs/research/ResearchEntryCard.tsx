import type { ResearchEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge } from '../../components/Badge';
import { Card } from '../../components/Card';
import { CommentIcon } from '../../components/CommentIcon';
import { useDialogs } from '../../components/DialogHost';
import { IconButton } from '../../components/IconButton';
import { StructuredValue } from '../../components/StructuredValue';
import { useT } from '../../i18n/i18n';
import { useMutation, useNav } from '../../store/hooks';
import { deleteResearch, proveResearch } from '../../api/research';
import { FindingView } from './FindingView';
import { parseFindings, proofBadgeSpec } from './findings';

const REFRESH_STATE = { refreshState: true } as const;

export interface ResearchEntryCardProps {
  readonly entry: ResearchEntry;
  readonly isAnchored: boolean;
}

function EntryActions({ entry }: { readonly entry: ResearchEntry }): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const prove = useMutation((proven: boolean) => proveResearch(entry.id, proven), REFRESH_STATE);
  const remove = useMutation(() => deleteResearch(entry.id), REFRESH_STATE);
  const confirmDelete = async (): Promise<void> => {
    const isConfirmed = await dialogs.confirm({ title: t('research.titleDeleteEntry'), message: t('dialog.deleteResearch'), confirmLabel: t('buttons.delete'), danger: true });
    if (isConfirmed) {
      await remove.run();
    }
  };
  return (
    <>
      <CommentIcon scope="research" target={`Research: ${entry.topic}`} label={t('vsc.research.commentOnEntry')} />
      <IconButton icon="check" tone="success" title={t(entry.proven === 1 ? 'research.titleVerified' : 'research.titleMarkVerified')} disabled={entry.proven === 1 || prove.pending} onClick={async () => {
        await prove.run(true);
      }} />
      <IconButton icon="close" tone="danger" title={t(entry.proven === -1 ? 'research.titleRejected' : 'research.titleMarkRejected')} disabled={entry.proven === -1 || prove.pending} onClick={async () => {
        await prove.run(false);
      }} />
      <IconButton icon="trash" title={t('research.titleDeleteEntry')} disabled={remove.pending} onClick={confirmDelete} />
    </>
  );
}

function EntryBadges({ entry }: { readonly entry: ResearchEntry }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const proof = proofBadgeSpec(entry.proven);
  const findingCount = parseFindings(entry.findings).findings.length;
  return (
    <>
      {entry.discussion_id !== null && (
        <button
          type="button"
          class="gw-research-discussion-link"
          title={t('research.linkedToDiscussion', { id: entry.discussion_id })}
          onClick={(event) => {
            event.stopPropagation();
            navigate({ tab: 'preplanning', anchor: `discussion-${entry.discussion_id}` });
          }}
        >
          <Badge label={`D#${entry.discussion_id}`} tone="warning" />
        </button>
      )}
      <span class="gw-research-count">{t('research.findingCount', { count: findingCount })}</span>
      <Badge label={t(proof.labelKey)} tone={proof.tone} />
    </>
  );
}

export function ResearchEntryCard({ entry, isAnchored }: ResearchEntryCardProps): JSX.Element {
  const t = useT();
  const { findings, unparsed } = parseFindings(entry.findings);
  return (
    <Card
      key={`${entry.id}-${isAnchored}`}
      id={`research-${entry.id}`}
      title={entry.topic || t('research.untitledResearch')}
      badge={<EntryBadges entry={entry} />}
      actions={<EntryActions entry={entry} />}
      collapsible
      defaultCollapsed={!isAnchored}
    >
      {entry.summary !== '' && <div class="gw-research-summary">{entry.summary}</div>}
      {entry.proven_notes !== null && entry.proven_notes !== '' && (
        <div class="gw-research-notes">
          <strong>{t('vsc.research.notes')}</strong>
          <div>{entry.proven_notes}</div>
        </div>
      )}
      {findings.map((finding, index) => <FindingView key={index} finding={finding} />)}
      {unparsed !== undefined && <StructuredValue value={unparsed} />}
      {findings.length === 0 && unparsed === undefined && <div class="gw-research-empty">{t('vsc.research.noFindings')}</div>}
    </Card>
  );
}
