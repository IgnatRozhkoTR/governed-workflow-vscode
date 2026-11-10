import type { JSX } from 'preact';
import { getHistory, type HistoryCommit, type RepoEntry } from '../../api/changes';
import { Badge, Card, Icon } from '../../components';
import { useT } from '../../i18n/i18n';
import { CommitList, RewriteUnavailableNote } from './HistoryPanel';

export interface RepoHistory {
  readonly path: string;
  readonly name: string;
  readonly commits: readonly HistoryCommit[];
}

export interface RepoHistoryGroupsProps {
  readonly histories: readonly RepoHistory[];
  readonly onSelectCommit: (repoPath: string, sha: string) => void;
}

const NO_SELECTION: readonly string[] = [];

export async function loadRepoHistories(repos: readonly RepoEntry[]): Promise<RepoHistory[]> {
  return Promise.all(repos.map(async (entry) => {
    const response = await getHistory({ repo: entry.path });
    return { path: entry.path, name: entry.name, commits: response.commits };
  }));
}

// Commits never span repositories, so the all-repositories history lists each repository's branch commits under its own header.
export function RepoHistoryGroups({ histories, onSelectCommit }: RepoHistoryGroupsProps): JSX.Element {
  const t = useT();
  return (
    <Card id="changes-history-all" title={t('vsc.changes.historyTitle')} subtitle={t('vsc.changes.pickRepoCommit')}>
      <RewriteUnavailableNote />
      <div class="gw-changes-repos">
        {histories.map((history) => (
          <section key={history.path} class="gw-changes-repo" aria-label={history.name}>
            <div class="gw-changes-repo-header">
              <Icon name="repo" />
              <span>{history.name}</span>
              <Badge tone="neutral" label={t('vsc.changes.commitCount', { count: history.commits.length })} />
            </div>
            <CommitList commits={history.commits} selected={NO_SELECTION} activeCommit={undefined} onClick={(_event, sha) => onSelectCommit(history.path, sha)} />
          </section>
        ))}
      </div>
    </Card>
  );
}
