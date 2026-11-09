import type { ScratchpadContent } from '@api-types';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { listScratchpads, readScratchpad, writeScratchpad } from '../../api/scratchpads';
import { listRepos } from '../../api/changes';
import { Badge, Button, EmptyState, Markdown, ResourceView, Select, Spinner, Tabs, TextField, TimeAgo, useDialogs, useToast } from '../../components';
import { useT } from '../../i18n/i18n';
import { rpc } from '../../rpc/rpcClient';
import { useMutation, usePersistentState, useResource, useWorkspaceState } from '../../store/hooks';
import type { TabProps } from '../types';

type ViewMode = 'preview' | 'source';

const ROOT_REPO = '';

export function ScratchpadsTab({ active }: TabProps): JSX.Element {
  const t = useT();
  const dialogs = useDialogs();
  const isMulti = useWorkspaceState().project_type === 'multi';
  const [repo, setRepo] = usePersistentState('scratchpads.repo', ROOT_REPO);
  const [name, setName] = usePersistentState<string>('scratchpads.name', '');
  const [isDirty, setDirty] = useState(false);

  const repos = useResource('scratchpads', 'repos', listRepos, { active: active && isMulti, refetchOnState: false });
  const repoOptions = [{ value: ROOT_REPO, label: t('scratchpads.rootLabel') }, ...(repos.data?.repos ?? []).map((entry) => ({ value: entry.path, label: entry.name }))];
  const activeRepo = repoOptions.some((option) => option.value === repo) ? repo : ROOT_REPO;
  const files = useResource('scratchpads', `list|${activeRepo}`, () => listScratchpads(activeRepo === ROOT_REPO ? undefined : activeRepo), { active });

  const confirmLeave = async (): Promise<boolean> =>
    !isDirty ||
    dialogs.confirm({ title: t('vsc.scratchpads.unsavedTitle'), message: t('vsc.scratchpads.unsavedMessage'), confirmLabel: t('vsc.scratchpads.discard'), danger: true });
  const selectRepo = async (next: string): Promise<void> => {
    if (await confirmLeave()) {
      setDirty(false);
      setRepo(next);
      setName('');
    }
  };
  const selectFile = async (next: string): Promise<void> => {
    if (next !== name && (await confirmLeave())) {
      setDirty(false);
      setName(next);
    }
  };

  return (
    <div class="gw-scratchpads">
      <aside class="gw-scratchpads-list">
        {isMulti && repoOptions.length > 1 && (
          <Select value={activeRepo} options={repoOptions} onChange={(value) => void selectRepo(value)} />
        )}
        <ResourceView resource={files} empty={(data) => data.files.length === 0} emptyMessage={t('scratchpads.empty')}>
          {(data) => (
            <nav class="gw-scratchpads-files" aria-label={t('scratchpads.title')}>
              {data.files.map((file) => (
                <button
                  type="button"
                  key={file.name}
                  class={`gw-scratchpads-file${file.name === name ? ' gw-scratchpads-file-active' : ''}`}
                  title={file.name}
                  onClick={() => void selectFile(file.name)}
                >
                  <span class="gw-scratchpads-file-title">{file.title || file.name}</span>
                  <span class="gw-muted gw-scratchpads-file-meta"><TimeAgo iso={file.updated_at} /></span>
                </button>
              ))}
            </nav>
          )}
        </ResourceView>
      </aside>
      <section class="gw-scratchpads-content">
        {name === '' ? (
          <EmptyState icon="notebook" message={t('scratchpads.selectFile')} />
        ) : (
          <ScratchpadEditor key={`${activeRepo}|${name}`} name={name} repo={activeRepo} active={active} onDirtyChange={setDirty} />
        )}
      </section>
    </div>
  );
}

interface EditorProps {
  readonly name: string;
  readonly repo: string;
  readonly active: boolean;
  readonly onDirtyChange: (isDirty: boolean) => void;
}

function ScratchpadEditor({ name, repo, active, onDirtyChange }: EditorProps): JSX.Element {
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
