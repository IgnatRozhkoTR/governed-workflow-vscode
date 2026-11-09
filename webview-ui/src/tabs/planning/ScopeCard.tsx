import type { PhaseScope, Plan } from '@api-types';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { setScope } from '../../api/planning';
import { Card, Commentable, EmptyState, IconButton, Tabs, TextField, type TabItem } from '../../components';
import { useT } from '../../i18n/i18n';
import { useMutation, usePersistentState } from '../../store/hooks';
import {
  ALL_SCOPE_TAB, addScopeEntry, removeScopeEntry, replaceScopeEntry, scopeCommentTarget, scopeEntries, sortedScopeKeys,
  type ScopeListKey, type ScopeMap,
} from './scopeModel';

interface ScopeCardProps {
  readonly scope: ScopeMap;
  readonly plan: Plan;
  readonly section?: string;
}

interface ListEditor {
  readonly isEditable: boolean;
  onAdd(path: string): Promise<void>;
  onReplace(index: number, path: string): Promise<void>;
  onRemove(index: number): Promise<void>;
}

const LIST_VIEWS: readonly { readonly key: ScopeListKey; readonly titleKey: string; readonly glyph: string }[] = [
  { key: 'must', titleKey: 'scope.mustModify', glyph: '◆' },
  { key: 'may', titleKey: 'scope.mayModify', glyph: '◇' },
];

function tabItems(scope: ScopeMap, plan: Plan, allLabel: string): TabItem[] {
  const names = new Map((plan.execution ?? []).map((item) => [item.id, item.name]));
  const phaseTabs = sortedScopeKeys(scope).map((key) => {
    const name = names.get(key);
    return { id: key, label: name === undefined || name === '' ? key : `${key} — ${name}` };
  });
  return [{ id: ALL_SCOPE_TAB, label: allLabel }, ...phaseTabs];
}

function useScopeSaver(): { save: (next: Record<string, PhaseScope>) => Promise<void>; pending: boolean } {
  const t = useT();
  const mutation = useMutation((next: Record<string, PhaseScope>) => setScope(next), { refreshState: true, successToast: t('vsc.planning.scopeSaved') });
  return { save: async (next) => { await mutation.run(next); }, pending: mutation.pending };
}

export function ScopeCard({ scope, plan, section }: ScopeCardProps): JSX.Element {
  const t = useT();
  const [selected, setSelected] = usePersistentState('planning.scopeTab', ALL_SCOPE_TAB);
  const saver = useScopeSaver();
  const items = tabItems(scope, plan, t('scope.all'));
  useEffect(() => {
    if (section !== undefined && items.some((item) => item.id === section)) {
      setSelected(section);
    }
  }, [section]);
  const activeId = items.some((item) => item.id === selected) ? selected : ALL_SCOPE_TAB;
  const isEditable = activeId !== ALL_SCOPE_TAB;
  const titleKey = isEditable ? 'scope.scopeTab' : 'scope.contractMerged';
  const editorFor = (listKey: ScopeListKey): ListEditor => ({
    isEditable,
    onAdd: (path) => saver.save(addScopeEntry(scope, activeId, listKey, path)),
    onReplace: (index, path) => saver.save(replaceScopeEntry(scope, activeId, listKey, index, path)),
    onRemove: (index) => saver.save(removeScopeEntry(scope, activeId, listKey, index)),
  });
  return (
    <Card id="plan-scope" title={t(titleKey, { id: activeId })}>
      {items.length <= 1 ? <EmptyState icon="target" message={t('vsc.planning.noScope')} /> : (
        <>
          <Tabs variant="sub" items={items} activeId={activeId} onChange={setSelected} />
          {!isEditable && <p class="gw-muted gw-planning-hint">{t('vsc.planning.scopeReadOnly')}</p>}
          <div class="gw-planning-scope-columns">
            {LIST_VIEWS.map((view) => (
              <ScopeList key={`${activeId}:${view.key}`} view={view} paths={scopeEntries(scope, activeId, view.key)} editor={editorFor(view.key)} />
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

interface ScopeListProps {
  readonly view: (typeof LIST_VIEWS)[number];
  readonly paths: readonly string[];
  readonly editor: ListEditor;
}

function ScopeList({ view, paths, editor }: ScopeListProps): JSX.Element {
  const t = useT();
  const [isAdding, setAdding] = useState(false);
  return (
    <section class="gw-planning-scope-list">
      <h4 class="gw-planning-scope-heading">
        <span class={`gw-planning-glyph gw-planning-glyph-${view.key}`}>{view.glyph}</span>
        {t(view.titleKey)}
        <span class="gw-planning-spacer" />
        {editor.isEditable && <IconButton icon="add" title={t('vsc.planning.addEntry')} onClick={() => setAdding(true)} />}
      </h4>
      {isAdding && <ScopeEntryInput initial="" onCancel={() => setAdding(false)} onSave={async (path) => { await editor.onAdd(path); setAdding(false); }} />}
      {paths.length === 0 && !isAdding && <p class="gw-muted gw-planning-hint">{t('vsc.planning.scopeEmpty')}</p>}
      <ul class="gw-planning-scope-items">
        {paths.map((path, index) => (
          <ScopeEntryRow key={`${index}:${path}`} listKey={view.key} path={path} index={index} editor={editor} />
        ))}
      </ul>
    </section>
  );
}

interface ScopeEntryRowProps {
  readonly listKey: ScopeListKey;
  readonly path: string;
  readonly index: number;
  readonly editor: ListEditor;
}

function ScopeEntryRow({ listKey, path, index, editor }: ScopeEntryRowProps): JSX.Element {
  const t = useT();
  const [isEditing, setEditing] = useState(false);
  if (isEditing) {
    return (
      <li class="gw-planning-scope-item">
        <ScopeEntryInput initial={path} onCancel={() => setEditing(false)} onSave={async (next) => { await editor.onReplace(index, next); setEditing(false); }} />
      </li>
    );
  }
  return (
    <li class="gw-planning-scope-item">
      <Commentable scope="scope" target={scopeCommentTarget(listKey, path)}>
        <div class="gw-planning-scope-entry">
          <code class="gw-planning-scope-path">{path}</code>
          {editor.isEditable && (
            <span class="gw-planning-scope-actions">
              <IconButton icon="edit" title={t('vsc.planning.editEntry')} onClick={() => setEditing(true)} />
              <IconButton icon="close" title={t('vsc.planning.removeEntry')} onClick={() => editor.onRemove(index)} />
            </span>
          )}
        </div>
      </Commentable>
    </li>
  );
}

interface ScopeEntryInputProps {
  readonly initial: string;
  readonly onSave: (path: string) => Promise<void>;
  readonly onCancel: () => void;
}

function ScopeEntryInput({ initial, onSave, onCancel }: ScopeEntryInputProps): JSX.Element {
  const t = useT();
  const [value, setValue] = useState(initial);
  const submit = async (): Promise<void> => {
    const path = value.trim();
    if (path !== '') {
      await onSave(path);
    }
  };
  return (
    <div class="gw-planning-scope-input">
      <TextField value={value} onInput={setValue} placeholder={t('placeholders.scopePath')} autoFocus onSubmit={submit} />
      <IconButton icon="check" title={t('buttons.save')} onClick={submit} />
      <IconButton icon="discard" title={t('vsc.common.cancel')} onClick={onCancel} />
    </div>
  );
}
