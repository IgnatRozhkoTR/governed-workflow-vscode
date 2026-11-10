import type { Discussion, ResearchEntry } from '@api-types';
import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { createDiscussion } from '../../api/core';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DiscussionThread } from '../../components/DiscussionThread';
import { EmptyState } from '../../components/EmptyState';
import { Select } from '../../components/Select';
import { TextField } from '../../components/TextField';
import { Toggle } from '../../components/Toggle';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { capitalizeFirstLetter } from '../../lib/format';
import { useMutation, useNav, usePersistentState } from '../../store/hooks';
import {
  countOpenDiscussions,
  countPendingResearchDiscussions,
  discussionTitle,
  distinctDiscussionTitle,
  isDiscussionDone,
  isResearchDiscussion,
  provenDiscussionIds,
  visibleDiscussions,
} from './discussionLogic';

export interface DiscussionsProps {
  readonly discussions: readonly Discussion[];
  readonly research: readonly ResearchEntry[];
}

const DISCUSSIONS_ANCHOR = 'preplanning-discussions';
const AFTER_CREATE = { invalidates: ['context'], refreshState: true } as const;

function AuthorBadge({ author }: { readonly author: string }): JSX.Element {
  const t = useT();
  const label = author === 'agent' ? t('author.agent') : author === 'user' ? t('author.user') : author;
  return <Badge label={label} tone={author === 'agent' ? 'accent' : 'neutral'} />;
}

function DiscussionBadges({ discussion, isDone }: { readonly discussion: Discussion; readonly isDone: boolean }): JSX.Element {
  const t = useT();
  const isResearch = isResearchDiscussion(discussion);
  const statusKey = isResearch ? (isDone ? 'badges.verified' : 'badges.pending') : isDone ? 'badges.resolved' : 'badges.open';
  return (
    <>
      <AuthorBadge author={discussion.author || 'user'} />
      <Badge label={capitalizeFirstLetter(t(isResearch ? 'badges.research' : 'discussionType.general'))} tone={isResearch ? 'warning' : 'info'} />
      <Badge label={capitalizeFirstLetter(t(statusKey))} tone={isDone ? 'success' : 'warning'} />
    </>
  );
}

function DiscussionCard({ discussion, research, isDone }: { readonly discussion: Discussion; readonly research: ResearchEntry | undefined; readonly isDone: boolean }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const title = distinctDiscussionTitle(discussion);
  const linked = research === undefined ? undefined : (
    <button type="button" class="gw-link" title={t('research.viewLinked')} onClick={() => navigate({ tab: 'research', anchor: `research-${research.id}` })}>
      {research.topic || t('research.untitledResearch')}
    </button>
  );
  return (
    <Card
      id={`discussion-${discussion.id}`}
      title={title ?? t('vsc.preplanning.discussionUntitled')}
      badge={<DiscussionBadges discussion={discussion} isDone={isDone} />}
      subtitle={linked}
      collapsedPreview={title === undefined ? discussionTitle(discussion) : undefined}
      collapsible
      defaultCollapsed={isDone}
    >
      <DiscussionThread discussion={discussion} />
    </Card>
  );
}

function NewDiscussionForm(): JSX.Element {
  const t = useT();
  const [type, setType] = useState('general');
  const [text, setText] = useState('');
  const create = useMutation((body: string, kind: string) => createDiscussion({ text: body, type: kind === 'research' ? 'research' : 'general' }), AFTER_CREATE);
  const submit = async (): Promise<void> => {
    const body = text.trim();
    if (body !== '' && (await create.run(body, type)) !== undefined) {
      setText('');
    }
  };
  const options = [
    { value: 'general', label: t('discussionType.general') },
    { value: 'research', label: t('discussionType.research') },
  ];
  return (
    <div class="gw-pp-new-discussion">
      <Select value={type} options={options} onChange={setType} ariaLabel={t('vsc.preplanning.discussionType')} />
      <TextField value={text} onInput={setText} placeholder={t('placeholders.raiseDiscussion')} onSubmit={() => void submit()} />
      <Button variant="primary" icon="add" label={t('vsc.preplanning.addDiscussion')} busy={create.pending} disabled={text.trim() === ''} onClick={submit} />
    </div>
  );
}

export function Discussions({ discussions, research }: DiscussionsProps): JSX.Element {
  const t = useT();
  const [showResolved, setShowResolved] = usePersistentState('pp.showResolved', false);
  const [showProven, setShowProven] = usePersistentState('pp.showProven', false);
  const provenIds = provenDiscussionIds(research);
  const visible = visibleDiscussions(discussions, provenIds, { showResolved, showProven });
  const visibleOpenCount = countOpenDiscussions(visible, provenIds);
  const hiddenCount = discussions.length - visible.length;
  const pendingResearch = countPendingResearchDiscussions(discussions, provenIds);
  const researchByDiscussion = new Map<number, ResearchEntry>();
  research.forEach((entry) => entry.discussion_id !== null && researchByDiscussion.set(entry.discussion_id, entry));
  const [ref, isHighlighted] = useAnchorTarget<HTMLElement>(DISCUSSIONS_ANCHOR);
  return (
    <section id={DISCUSSIONS_ANCHOR} ref={ref} class={classNames('gw-pp-group gw-anchor-target', isHighlighted && 'gw-card-highlight')}>
      <div class="gw-pp-heading-row">
        <h2 class="gw-pp-heading">{t('preplanning.discussions')}</h2>
        {visible.length > 0 && <Badge label={String(visibleOpenCount > 0 ? visibleOpenCount : visible.length)} tone={visibleOpenCount > 0 ? 'warning' : 'success'} />}
        {hiddenCount > 0 && <Badge label={t('vsc.preplanning.hiddenCount', { count: hiddenCount })} tone="neutral" />}
        {pendingResearch > 0 && <Badge label={t('badges.researchCount', { count: pendingResearch })} tone="warning" />}
        <div class="gw-pp-toggles">
          <Toggle checked={showResolved} onChange={setShowResolved} label={t(showResolved ? 'discussions.hideResolved' : 'discussions.showResolved')} />
          <Toggle checked={showProven} onChange={setShowProven} label={t(showProven ? 'discussions.hideProven' : 'discussions.showProven')} />
        </div>
      </div>
      {discussions.length === 0 && <EmptyState icon="comment-discussion" message={t('discussions.noItems')} />}
      {discussions.length > 0 && visible.length === 0 && <EmptyState icon="eye-closed" message={t('vsc.preplanning.noVisibleDiscussions')} />}
      {visible.map((discussion) => (
        <DiscussionCard
          key={discussion.id}
          discussion={discussion}
          research={researchByDiscussion.get(discussion.id)}
          isDone={isDiscussionDone(discussion, provenIds)}
        />
      ))}
      <NewDiscussionForm />
    </section>
  );
}
