import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { historyRename, historySquash, historyUndo, type BranchEntry, type HistoryCommit } from '../../api/changes';
import { Badge, Button, Card, EmptyState, Icon, TimeAgo, useDialogs } from '../../components';
import { useT } from '../../i18n/i18n';
import { useMutation } from '../../store/hooks';
import { canRename, canSquash, canUndo, fullMessage, renameTarget, selectedCommitsInOrder, toggleSelection } from './historyModel';
import { SquashDialog } from './SquashDialog';

export interface HistoryPanelProps {
  readonly commits: readonly HistoryCommit[];
  readonly branches: readonly BranchEntry[];
  readonly activeRef: string | undefined;
  readonly activeCommit: string | undefined;
  readonly onSelectRef: (ref: string | undefined) => void;
  readonly onSelectCommit: (sha: string) => void;
  readonly canRewrite: boolean;
  readonly repo?: string;
}

interface ActionAvailability {
  readonly disabled: boolean;
  readonly title?: string;
}

const MUTATION_OPTIONS = { invalidates: ['diff', 'history'], refreshState: true } as const;

export function HistoryPanel(props: HistoryPanelProps): JSX.Element {
  const { commits, branches, activeRef, activeCommit, onSelectRef, onSelectCommit, canRewrite, repo } = props;
  const t = useT();
  const dialogs = useDialogs();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [isSquashOpen, setSquashOpen] = useState(false);
  const rename = useMutation(historyRename, { ...MUTATION_OPTIONS, successToast: t('vsc.changes.renamed') });
  const undo = useMutation(historyUndo, { ...MUTATION_OPTIONS, successToast: t('vsc.changes.undone') });
  const squash = useMutation(historySquash, { ...MUTATION_OPTIONS, successToast: t('vsc.changes.squashed') });
  const target = renameTarget(commits, activeCommit);
  const picked = selectedCommitsInOrder(selected, commits);
  // Rewrites target one repository, so the all-repositories view offers none.
  const availability = (isAllowed: boolean, deniedKey: string): ActionAvailability => {
    if (!canRewrite) {
      return { disabled: true, title: t('vsc.changes.rewriteSingleRepoOnly') };
    }
    return isAllowed ? { disabled: false } : { disabled: true, title: t(deniedKey) };
  };
  const renameState = availability(canRename(commits, activeCommit), 'vsc.changes.renameOnlyLocal');
  const undoState = availability(canUndo(commits), 'vsc.changes.undoOnlyLocal');
  const squashState = availability(canSquash(selected, commits), 'vsc.changes.squashRequires');

  if (commits.length === 0 && activeRef === undefined) {
    return <BranchWithoutCommits />;
  }
  const handleClick = (event: MouseEvent, sha: string): void => {
    if (canRewrite && (event.metaKey || event.ctrlKey)) {
      setSelected(toggleSelection(selected, sha));
      return;
    }
    setSelected([]);
    onSelectCommit(sha);
  };
  const runRename = async (): Promise<void> => {
    if (target === undefined) {
      return;
    }
    const message = await dialogs.prompt({
      title: t('history.rename'),
      message: t('history.dialogs.renamePrompt'),
      initialValue: fullMessage(target),
      multiline: true,
      required: true,
      confirmLabel: t('history.rename'),
    });
    if (message !== undefined && message.trim() !== '') {
      await rename.run(target.full_sha, message.trim(), repo);
    }
  };
  const runUndo = async (): Promise<void> => {
    const head = commits[0];
    const isConfirmed = await dialogs.confirm({
      title: t('history.undo'),
      message: t('history.dialogs.undoConfirm', { subject: head?.subject ?? '' }),
      confirmLabel: t('history.undo'),
      danger: true,
    });
    if (isConfirmed) {
      await undo.run(repo);
    }
  };
  const confirmSquash = async (message: string): Promise<void> => {
    const result = await squash.run(picked.map((commit) => commit.full_sha), message, repo);
    if (result !== undefined) {
      setSquashOpen(false);
      setSelected([]);
    }
  };

  return (
    <Card
      id="changes-history"
      title={t('vsc.changes.historyTitle')}
      subtitle={canRewrite ? t('vsc.changes.selectHint') : undefined}
      badge={selected.length > 0 ? <Badge tone="accent" label={t('vsc.changes.selected', { count: selected.length })} /> : undefined}
      actions={
        <>
          <Button size="sm" variant="secondary" icon="edit" label={t('history.rename')} {...renameState} onClick={runRename} />
          <Button size="sm" variant="secondary" icon="discard" label={t('history.undo')} {...undoState} onClick={runUndo} />
          <Button size="sm" variant="secondary" icon="git-merge" label={t('history.squash')} {...squashState} onClick={() => setSquashOpen(true)} />
        </>
      }
    >
      {!canRewrite && <RewriteUnavailableNote />}
      <div class="gw-changes-history">
        <BranchList branches={branches} activeRef={activeRef} onSelect={onSelectRef} />
        <CommitList commits={commits} selected={selected} activeCommit={activeCommit} onClick={handleClick} />
      </div>
      {isSquashOpen && <SquashDialog commits={picked} onClose={() => setSquashOpen(false)} onConfirm={confirmSquash} />}
    </Card>
  );
}

// The current branch has nothing to pick, rename, undo or squash, so the card says that once instead of offering them.
function BranchWithoutCommits(): JSX.Element {
  const t = useT();
  return (
    <Card id="changes-history" title={t('vsc.changes.historyTitle')}>
      <EmptyState icon="git-commit" message={t('vsc.changes.noBranchCommits')} />
    </Card>
  );
}

export function RewriteUnavailableNote(): JSX.Element {
  const t = useT();
  return <p class="gw-muted gw-changes-note">{t('vsc.changes.rewriteSingleRepoOnly')}</p>;
}

function BranchList(props: { readonly branches: readonly BranchEntry[]; readonly activeRef: string | undefined; readonly onSelect: (ref: string | undefined) => void }): JSX.Element {
  const t = useT();
  return (
    <nav class="gw-changes-branches" aria-label={t('vsc.changes.branches')}>
      {props.branches.map((branch) => {
        const isActive = props.activeRef === undefined ? branch.current : props.activeRef === branch.ref;
        return (
          <button
            type="button"
            key={branch.ref}
            class={`gw-changes-branch${isActive ? ' gw-changes-branch-active' : ''}`}
            title={branch.ref}
            onClick={() => props.onSelect(branch.current ? undefined : branch.ref)}
          >
            <Icon name="git-branch" />
            <span>{branch.name}</span>
          </button>
        );
      })}
    </nav>
  );
}

export interface CommitListProps {
  readonly commits: readonly HistoryCommit[];
  readonly selected: readonly string[];
  readonly activeCommit: string | undefined;
  readonly onClick: (event: MouseEvent, sha: string) => void;
}

export function CommitList({ commits, selected, activeCommit, onClick }: CommitListProps): JSX.Element {
  const t = useT();
  if (commits.length === 0) {
    return <EmptyState icon="git-commit" message={t('vsc.changes.noCommits')} />;
  }
  return (
    <div class="gw-changes-commits">
      {commits.map((commit) => (
        <div
          key={commit.full_sha}
          class={`gw-changes-commit${commit.full_sha === activeCommit ? ' gw-changes-commit-active' : ''}${selected.includes(commit.full_sha) ? ' gw-changes-commit-selected' : ''}`}
          onClick={(event) => onClick(event, commit.full_sha)}
        >
          <code class="gw-changes-sha">
            {commit.ahead_of_origin && <span class="gw-changes-ahead" title={t('vsc.changes.ahead')} />}
            {commit.sha}
          </code>
          <span class="gw-changes-subject" title={commit.subject}>{commit.subject}</span>
          <span class="gw-muted gw-changes-author">{commit.author_name}</span>
          <span class="gw-muted gw-changes-date"><TimeAgo iso={commit.author_date} /></span>
        </div>
      ))}
    </div>
  );
}
