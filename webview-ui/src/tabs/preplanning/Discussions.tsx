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
import { useT } from '../../i18n/i18n';
import { useMutation, useNav, usePersistentState } from '../../store/hooks';
import type { NavTarget } from '@shared/navigation';
import { countOpenDiscussions, isDiscussionDone, isResearchDiscussion, provenDiscussionIds, visibleDiscussions } from './discussionLogic';

export interface DiscussionsProps {
  readonly discussions: readonly Discussion[];
  readonly research: readonly ResearchEntry[];
  readonly nav: NavTarget;
}

const AFTER_CREATE = { invalidates: ['context'], refreshState: true } as const;

function AuthorBadge({ author }: { readonly author: string }): JSX.Element {
  const t = useT();
  const label = author === 'agent' ? t('author.agent') : author === 'user' ? t('author.user') : author;
  return <Badge label={label} tone={author === 'agent' ? 'accent' : 'neutral'} />;
}

function DiscussionBadges({ discussion, isDone }: { readonly discussion: Discussion; readonly isDone: boolean }): JSX.Element {
  const t = useT();
  const isResearch = isResearchDiscussion(discussion);
  const statusLabel = isResearch ? (isDone ? t('badges.verified') : t('badges.pending')) : isDone ? t('badges.resolved') : t('badges.open');
  return (
    <>
      <AuthorBadge author={discussion.author || 'user'} />
      <Badge label={isResearch ? t('badges.research') : t('discussionType.general')} tone={isResearch ? 'warning' : 'info'} />
      <Badge label={statusLabel} tone={isDone ? 'success' : 'warning'} />
    </>
  );
}

function DiscussionCard({ discussion, research, isDone, isAnchored }: { readonly discussion: Discussion; readonly research: ResearchEntry | undefined; readonly isDone: boolean; readonly isAnchored: boolean }): JSX.Element {
  const t = useT();
  const [, navigate] = useNav();
  const linked = research === undefined ? undefined : (
    <button type="button" class="gw-link" title={t('research.viewLinked')} onClick={() => navigate({ tab: 'research', anchor: `research-${research.id}` })}>
      {research.topic || t('research.untitledResearch')}
    </button>
  );
  return (
    <Card
      key={`${discussion.id}-${isAnchored}`}
      id={`discussion-${discussion.id}`}
      title={`#${discussion.id}`}
      subtitle={linked}
      collapsible
      defaultCollapsed={isDone && !isAnchored}
    >
      <DiscussionThread discussion={discussion} badges={<DiscussionBadges discussion={discussion} isDone={isDone} />} />
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
      <Select value={type} options={options} onChange={setType} />
      <TextField value={text} onInput={setText} placeholder={t('placeholders.raiseDiscussion')} onSubmit={() => void submit()} />
      <Button variant="primary" icon="add" label={t('vsc.preplanning.addDiscussion')} busy={create.pending} disabled={text.trim() === ''} onClick={submit} />
    </div>
  );
}

export function Discussions({ discussions, research, nav }: DiscussionsProps): JSX.Element {
  const t = useT();
  const [showResolved, setShowResolved] = usePersistentState('pp.showResolved', false);
  const [showProven, setShowProven] = usePersistentState('pp.showProven', false);
  const provenIds = provenDiscussionIds(research);
  const visible = visibleDiscussions(discussions, provenIds, { showResolved, showProven });
  const openCount = countOpenDiscussions(discussions);
  const researchByDiscussion = new Map<number, ResearchEntry>();
  research.forEach((entry) => entry.discussion_id !== null && researchByDiscussion.set(entry.discussion_id, entry));
  return (
    <section class="gw-pp-group">
      <div class="gw-pp-heading-row">
        <h2 class="gw-pp-heading">{t('preplanning.discussions')}</h2>
        <Badge label={String(openCount > 0 ? openCount : discussions.length)} tone={openCount > 0 ? 'warning' : 'success'} />
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
          isAnchored={nav.anchor === `discussion-${discussion.id}`}
        />
      ))}
      <NewDiscussionForm />
    </section>
  );
}
