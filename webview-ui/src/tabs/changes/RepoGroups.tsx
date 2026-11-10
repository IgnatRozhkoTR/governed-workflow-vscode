import type { DiffFile } from '@api-types';
import type { JSX } from 'preact';
import { Badge, Icon } from '../../components';
import { useT } from '../../i18n/i18n';
import { filesCountLabel, filterFiles, nativeRepo, type RepoDiff } from './diffModel';
import { FileList, type FileView } from './FileList';

export interface RepoGroupsProps {
  readonly repoDiffs: readonly RepoDiff[];
  readonly filter: string;
  readonly view: FileView;
  readonly isThreadsShown: boolean;
  readonly onOpenDiff: (repo: RepoDiff, file: DiffFile) => void;
  readonly onOpenFile: (repo: RepoDiff, file: DiffFile) => void;
}

type RepoGroupProps = Omit<RepoGroupsProps, 'repoDiffs'> & { readonly repoDiff: RepoDiff };

// The all-repositories view stacks every repository's changes so none is missed before approving.
export function RepoGroups({ repoDiffs, ...shared }: RepoGroupsProps): JSX.Element {
  return <div class="gw-changes-repos">{repoDiffs.map((repoDiff) => <RepoGroup key={repoDiff.path} repoDiff={repoDiff} {...shared} />)}</div>;
}

function RepoGroup({ repoDiff, filter, view, isThreadsShown, onOpenDiff, onOpenFile }: RepoGroupProps): JSX.Element {
  const files = filterFiles(repoDiff.files, filter);
  const isFiltered = filter.trim() !== '';
  return (
    <section class="gw-changes-repo" aria-label={repoDiff.name}>
      <RepoHeader repoDiff={repoDiff} shownCount={files.length} isFiltered={isFiltered} />
      <FileList
        files={files}
        view={view}
        hasFilter={isFiltered}
        repo={nativeRepo(repoDiff.path)}
        isThreadsShown={isThreadsShown}
        onOpenDiff={(file) => onOpenDiff(repoDiff, file)}
        onOpenFile={(file) => onOpenFile(repoDiff, file)}
      />
    </section>
  );
}

interface RepoHeaderProps {
  readonly repoDiff: RepoDiff;
  readonly shownCount: number;
  readonly isFiltered: boolean;
}

function RepoHeader({ repoDiff, shownCount, isFiltered }: RepoHeaderProps): JSX.Element {
  const t = useT();
  return (
    <div class="gw-changes-repo-header">
      <Icon name="repo" />
      <span>{repoDiff.name}</span>
      <Badge tone="neutral" label={filesCountLabel(t, shownCount, repoDiff.files.length, isFiltered)} />
    </div>
  );
}
