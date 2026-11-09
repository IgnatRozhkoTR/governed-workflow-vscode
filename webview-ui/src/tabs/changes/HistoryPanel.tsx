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
}

const MUTATION_OPTIONS = { invalidates: ['diff', 'history'], refreshState: true } as const;

export function HistoryPanel(props: HistoryPanelProps): JSX.Element {
  const { commits, branches, activeRef, activeCommit, onSelectRef, onSelectCommit } = props;
  const t = useT();
  const dialogs = useDialogs();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [isSquashOpen, setSquashOpen] = useState(false);
  const rename = useMutation(historyRename, { ...MUTATION_OPTIONS, successToast: t('vsc.changes.renamed') });
  const undo = useMutation(historyUndo, { ...MUTATION_OPTIONS, successToast: t('vsc.changes.undone') });
  const squash = useMutation(historySquash, { ...MUTATION_OPTIONS, successToast: t('vsc.changes.squashed') });
  const target = renameTarget(commits, activeCommit);
  const picked = selectedCommitsInOrder(selected, commits);
  const squashable = canSquash(selected, commits);

  const handleClick = (event: MouseEvent, sha: string): void => {
    if (event.metaKey || event.ctrlKey) {
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
      await rename.run(target.full_sha, message.trim());
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
      await undo.run();
    }
  };
  const confirmSquash = async (message: string): Promise<void> => {
    const result = await squash.run(picked.map((commit) => commit.full_sha), message);
    if (result !== undefined) {
      setSquashOpen(false);
      setSelected([]);
    }
  };

  return (
    <Card
      id="changes-history"
      title={t('vsc.changes.historyTitle')}
      subtitle={t('vsc.changes.selectHint')}
      badge={selected.length > 0 ? <Badge tone="accent" label={t('vsc.changes.selected', { count: selected.length })} /> : undefined}
      actions={
        <>
          <Button size="sm" variant="secondary" icon="edit" label={t('history.rename')} disabled={!canRename(commits, activeCommit)} title={canRename(commits, activeCommit) ? undefined : t('vsc.changes.renameOnlyLocal')} onClick={runRename} />
          <Button size="sm" variant="secondary" icon="discard" label={t('history.undo')} disabled={!canUndo(commits)} title={canUndo(commits) ? undefined : t('vsc.changes.undoOnlyLocal')} onClick={runUndo} />
          <Button size="sm" variant="secondary" icon="git-merge" label={t('history.squash')} disabled={!squashable} title={squashable ? undefined : t('vsc.changes.squashRequires')} onClick={() => setSquashOpen(true)} />
        </>
      }
    >
      <div class="gw-changes-history">
        <BranchList branches={branches} activeRef={activeRef} onSelect={onSelectRef} />
        <CommitList commits={commits} selected={selected} activeCommit={activeCommit} onClick={handleClick} />
      </div>
      {isSquashOpen && <SquashDialog commits={picked} onClose={() => setSquashOpen(false)} onConfirm={confirmSquash} />}
    </Card>
  );
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

interface CommitListProps {
  readonly commits: readonly HistoryCommit[];
  readonly selected: readonly string[];
  readonly activeCommit: string | undefined;
  readonly onClick: (event: MouseEvent, sha: string) => void;
}

function CommitList({ commits, selected, activeCommit, onClick }: CommitListProps): JSX.Element {
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
