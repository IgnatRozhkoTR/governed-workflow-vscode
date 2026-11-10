import type { ResearchEntry } from '@api-types';
import type { JSX } from 'preact';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { CommentIcon } from '../../components/CommentIcon';
import { useDialogs } from '../../components/DialogHost';
import { IconButton } from '../../components/IconButton';
import { StructuredValue } from '../../components/StructuredValue';
import { useT } from '../../i18n/i18n';
import { capitalizeFirstLetter } from '../../lib/format';
import { selectOpenCommentCount } from '../../store/store';
import { useMutation, useNav, useStore, useWorkspaceState } from '../../store/hooks';
import { deleteResearch, proveResearch } from '../../api/research';
import { linkedDiscussionTitle } from '../preplanning/discussionLogic';
import { FindingView } from './FindingView';
import { type Finding, findingCommentTarget, findingCountKey, parseFindings, proofBadgeSpec } from './findings';

const REFRESH_STATE = { refreshState: true } as const;

export interface ResearchEntryCardProps {
  readonly entry: ResearchEntry;
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
      <Button
        size="sm"
        variant="secondary"
        icon="check"
        label={t('vsc.research.verify')}
        title={t(entry.proven === 1 ? 'research.titleVerified' : 'research.titleMarkVerified')}
        disabled={entry.proven === 1 || prove.pending}
        onClick={async () => {
          await prove.run(true);
        }}
      />
      <Button
        size="sm"
        variant="secondary"
        icon="close"
        label={t('vsc.research.reject')}
        title={t(entry.proven === -1 ? 'research.titleRejected' : 'research.titleMarkRejected')}
        disabled={entry.proven === -1 || prove.pending}
        onClick={async () => {
          await prove.run(false);
        }}
      />
      <IconButton icon="trash" title={t('research.titleDeleteEntry')} disabled={remove.pending} onClick={confirmDelete} />
    </>
  );
}

function useFindingsOpenCommentCount(findings: readonly Finding[]): number {
  return useStore((s) => findings.reduce((total, finding) => total + selectOpenCommentCount(s, 'research', findingCommentTarget(finding.summary)), 0));
}

function EntryBadges({ entry }: { readonly entry: ResearchEntry }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const proof = proofBadgeSpec(entry.proven);
  const findings = parseFindings(entry.findings).findings;
  const openComments = useFindingsOpenCommentCount(findings);
  const discussion = useWorkspaceState().discussions?.find((candidate) => candidate.id === entry.discussion_id);
  return (
    <>
      {entry.discussion_id !== null && (
        <button
          type="button"
          class="gw-research-discussion-link"
          title={linkedDiscussionTitle(t, discussion)}
          onClick={(event) => {
            event.stopPropagation();
            navigate({ tab: 'preplanning', anchor: `discussion-${entry.discussion_id}` });
          }}
        >
          <Badge icon="comment-discussion" label={t('vsc.research.discussionBadge')} tone="warning" />
        </button>
      )}
      <span class="gw-research-count">{t(findingCountKey(findings.length), { count: findings.length })}</span>
      <Badge label={capitalizeFirstLetter(t(proof.labelKey))} tone={proof.tone} />
      {openComments > 0 && <Badge icon="comment" label={String(openComments)} tone="warning" title={t('vsc.research.openFindingComments', { count: openComments })} />}
    </>
  );
}

export function ResearchEntryCard({ entry }: ResearchEntryCardProps): JSX.Element {
  const t = useT();
  const { findings, unparsed } = parseFindings(entry.findings);
  return (
    <Card
      id={`research-${entry.id}`}
      persistKey={`research-v2-${entry.id}`}
      title={entry.topic || t('research.untitledResearch')}
      badge={<EntryBadges entry={entry} />}
      actions={<EntryActions entry={entry} />}
      collapsible
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
