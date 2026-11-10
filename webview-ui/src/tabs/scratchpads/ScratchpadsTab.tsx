import type { ScratchpadContent } from '@api-types';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { listScratchpads, readScratchpad, writeScratchpad } from '../../api/scratchpads';
import { listRepos } from '../../api/changes';
import { Badge, Button, EmptyState, Markdown, ResourceView, Spinner, Tabs, TextField, TimeAgo, useDialogs, useToast } from '../../components';
import type { DialogsApi } from '../../components/DialogHost';
import { classNames } from '../../components/types';
import { useT } from '../../i18n/i18n';
import { rpc } from '../../rpc/rpcClient';
import { useMutation, usePersistentState, useResource, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';
import { findFile, hasNoFiles, isSameSelection, resolveSelection, ROOT_REPO, type ScratchpadSection, type ScratchpadSelection } from './scratchpadSections';

type ViewMode = 'preview' | 'source';

const UNSAFE_FILENAME_CHARS = /[/\\:*?"<>|\x00-\x1f]/g;
const MARKDOWN_EXTENSION = /\.md$/i;
const NO_SELECTION: ScratchpadSelection = { repo: ROOT_REPO, name: '' };

function downloadFilename(name: string, title: string | undefined): string {
  const sanitized = (title ?? '').replace(UNSAFE_FILENAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (sanitized === '') {
    return name;
  }
  return MARKDOWN_EXTENSION.test(sanitized) ? sanitized : `${sanitized}.md`;
}

async function loadSections(isMulti: boolean): Promise<ScratchpadSection[]> {
  const root = listScratchpads().then((list) => ({ repo: ROOT_REPO, label: '', files: list.files }));
  if (!isMulti) {
    return [await root];
  }
  const { repos } = await listRepos();
  const repoSections = repos.map(async (entry) => ({ repo: entry.path, label: entry.name, files: (await listScratchpads(entry.path)).files }));
  return Promise.all([root, ...repoSections]);
}

interface FileListProps {
  readonly sections: readonly ScratchpadSection[];
  readonly showHeaders: boolean;
  readonly selected: ScratchpadSelection | undefined;
  readonly onSelect: (selection: ScratchpadSelection) => void;
}

function ScratchpadFileList({ sections, showHeaders, selected, onSelect }: FileListProps): JSX.Element {
  const t = useT();
  return (
    <nav class="gw-scratchpads-files" aria-label={t('scratchpads.title')}>
      {sections.map((section) => (
        <div key={section.repo} class="gw-scratchpads-section">
          {showHeaders && <div class="gw-scratchpads-section-header">{section.repo === ROOT_REPO ? t('scratchpads.rootLabel') : section.label}</div>}
          {section.files.length === 0 && showHeaders && <div class="gw-muted gw-scratchpads-section-empty">{t('scratchpads.empty')}</div>}
          {section.files.map((file) => {
            const selection = { repo: section.repo, name: file.name };
            const isActive = selected !== undefined && isSameSelection(selected, selection);
            return (
              <button type="button" key={file.name} class={`gw-scratchpads-file${isActive ? ' gw-scratchpads-file-active' : ''}`} title={file.name} onClick={() => onSelect(selection)}>
                <span class="gw-scratchpads-file-title">{file.title || file.name}</span>
                <span class="gw-muted gw-scratchpads-file-meta"><TimeAgo iso={file.updated_at} /></span>
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function ScratchpadsTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const isMulti = useWorkspaceState().project_type === 'multi';
  const [stored, setStored] = usePersistentState<ScratchpadSelection>('scratchpads.selection', NO_SELECTION);
  const [isDirty, setDirty] = useState(false);
  const sections = useResource('scratchpads', `sections|${isMulti}`, () => loadSections(isMulti), { active });
  const loaded = sections.data ?? [];
  const selected = resolveSelection(loaded, stored);
  const isEmpty = sections.data !== undefined && hasNoFiles(loaded);

  const selectFile = async (next: ScratchpadSelection): Promise<void> => {
    const isChange = selected === undefined || !isSameSelection(selected, next);
    if (isChange && (!isDirty || (await confirmDiscard(dialogs, t)))) {
      setDirty(false);
      setStored(next);
    }
  };

  return (
    <div class={classNames('gw-scratchpads', isEmpty && 'gw-scratchpads--empty')}>
      <aside class="gw-scratchpads-list">
        <ResourceView resource={sections} empty={hasNoFiles} emptyMessage={t('scratchpads.empty')}>
          {(data) => <ScratchpadFileList sections={data} showHeaders={isMulti} selected={selected} onSelect={(next) => void selectFile(next)} />}
        </ResourceView>
      </aside>
      {!isEmpty && (
        <section class="gw-scratchpads-content">
          {selected === undefined ? (
            <EmptyState icon="notebook" message={t('scratchpads.selectFile')} />
          ) : (
            <ScratchpadEditor
              key={`${selected.repo}|${selected.name}`}
              name={selected.name}
              title={findFile(loaded, selected)?.title}
              repo={selected.repo}
              active={active}
              onDirtyChange={setDirty}
            />
          )}
        </section>
      )}
    </div>
  );
}

function confirmDiscard(dialogs: DialogsApi, t: ReturnType<typeof useT>): Promise<boolean> {
  return dialogs.confirm({ title: t('vsc.scratchpads.unsavedTitle'), message: t('vsc.scratchpads.unsavedMessage'), confirmLabel: t('vsc.scratchpads.discard'), danger: true });
}

interface EditorProps {
  readonly name: string;
  readonly title: string | undefined;
  readonly repo: string;
  readonly active: boolean;
  readonly onDirtyChange: (isDirty: boolean) => void;
}

function ScratchpadEditor({ name, title, repo, active, onDirtyChange }: EditorProps): JSX.Element {
  const t = useT();
  const toast = useToast();
  const apiRepo = repo === ROOT_REPO ? undefined : repo;
  const resource = useResource<ScratchpadContent>('scratchpads', `content|${repo}|${name}`, () => readScratchpad(name, apiRepo), { active, refetchOnState: false });
  const [mode, setMode] = usePersistentState<ViewMode>('scratchpads.mode', 'preview');
  const [draft, setDraft] = useState('');
  const [saved, setSaved] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);
  const isDirty = draft !== saved;

  useEffect(() => {
    if (resource.data !== undefined) {
      setDraft(resource.data.content);
      setSaved(resource.data.content);
      setUpdatedAt(resource.data.updated_at);
    }
  }, [resource.data]);
  useEffect(() => onDirtyChange(isDirty), [isDirty]);
  useEffect(() => () => onDirtyChange(false), []);

  const save = useMutation(
    async () => {
      const result = await writeScratchpad(name, draft, apiRepo);
      setSaved(draft);
      setUpdatedAt(result.updated_at);
      return result;
    },
    { invalidates: ['scratchpads'], successToast: t('messages.fileSaved') },
  );
  const copy = async (): Promise<void> => {
    try {
      await rpc.call('native.copyText', { text: draft });
      toast.success(t('actions.copied'));
    } catch (error) {
      toast.error(error);
    }
  };
  const download = async (): Promise<void> => {
    try {
      const result = await rpc.call('native.saveFile', { suggestedName: downloadFilename(name, title), content: draft });
      if (result.saved) {
        toast.success(t('messages.fileSaved'));
      }
    } catch (error) {
      toast.error(error);
    }
  };

  if (resource.data === undefined) {
    return resource.error === undefined ? <Spinner /> : <ResourceView resource={resource}>{() => null}</ResourceView>;
  }
  return (
    <>
      <header class="gw-scratchpads-header">
        <span class="gw-scratchpads-name">{name}</span>
        {isDirty && <Badge tone="warning" label={t('vsc.scratchpads.unsaved')} />}
        <Tabs
          variant="sub"
          activeId={mode}
          onChange={(id) => setMode(id as ViewMode)}
          items={[
            { id: 'source', label: t('buttons.source') },
            { id: 'preview', label: t('buttons.preview') },
          ]}
        />
        <span class="gw-scratchpads-spacer" />
        {updatedAt !== undefined && <span class="gw-muted">{t('vsc.scratchpads.updated')} <TimeAgo iso={updatedAt} /></span>}
        <Button size="sm" variant="secondary" icon="copy" label={t('buttons.copy')} onClick={copy} />
        <Button size="sm" variant="secondary" icon="cloud-download" label={t('buttons.download')} onClick={download} />
        {mode === 'source' && <Button size="sm" variant="primary" icon="save" label={t('buttons.save')} disabled={!isDirty} onClick={async () => { await save.run(); }} />}
      </header>
      {mode === 'source' ? (
        <div class="gw-scratchpads-source">
          <TextField multiline rows={24} value={draft} onInput={setDraft} />
        </div>
      ) : (
        <div class="gw-scratchpads-preview">
          <Markdown source={draft} mermaid />
        </div>
      )}
    </>
  );
}
