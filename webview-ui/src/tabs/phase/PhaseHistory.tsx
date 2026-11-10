import type { PhaseTransition, ReviewComment } from '@api-types';
import type { JSX } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { replyComment, resolveComment } from '../../api/core';
import { EmptyState, Icon } from '../../components';
import { changeComments, toThreadMessage } from '../../components/CommentThread';
import { ThreadView } from '../../components/ThreadView';
import { useT } from '../../i18n/i18n';
import { formatDate } from '../../lib/format';
import { usePhaseLabel, useStore } from '../../store/hooks';
import { groupHistory, isProminentTransition, type HistoryItem, type IndexedTransition } from './historyGrouping';
import { placeRejectionNotes, rejectionNotes } from './rejectionNotes';

const NO_COMMENTS = {};
const NO_NOTES: readonly ReviewComment[] = [];

function PhaseRef({ phase, name }: { readonly phase: string; readonly name: string }): JSX.Element {
  return (
    <span class="gw-phase-history-ref">
      <code>{phase}</code>
      {name !== phase && <span class="gw-phase-history-name">{name}</span>}
    </span>
  );
}

// A gate's "Send back" feedback counts as an open comment until resolved, so it sits under the move it caused.
function RejectionNotes({ notes }: { readonly notes: readonly ReviewComment[] }): JSX.Element {
  return (
    <div class="gw-phase-history-notes">
      {notes.map((note) => (
        <ThreadView
          key={note.id}
          root={toThreadMessage(note)}
          replies={(note.replies ?? []).map(toThreadMessage)}
          resolved={note.resolved}
          collapsedWhenResolved
          onReply={(text) => changeComments(replyComment(note.id, text))}
          onToggleResolved={(next) => changeComments(resolveComment(note.id, next))}
        />
      ))}
    </div>
  );
}

function HistoryEntry({ entry, notes }: { readonly entry: PhaseTransition; readonly notes: readonly ReviewComment[] }): JSX.Element {
  const labelOf = usePhaseLabel();
  const isProminent = isProminentTransition(entry, notes.length > 0);
  return (
    <li class={isProminent ? 'gw-phase-history-entry gw-phase-history-key' : 'gw-phase-history-entry'}>
      <span class="gw-phase-history-move">
        <PhaseRef phase={entry.from} name={labelOf(entry.from)} />
        <span class="gw-phase-history-to">
          <Icon name="arrow-right" />
          <PhaseRef phase={entry.to} name={labelOf(entry.to)} />
        </span>
      </span>
      <span class="gw-muted gw-phase-history-time">{formatDate(entry.time)}</span>
      {notes.length > 0 && <RejectionNotes notes={notes} />}
    </li>
  );
}

function RoutineRun({ items }: { readonly items: readonly IndexedTransition[] }): JSX.Element {
  const t = useT();
  const [isOpen, setOpen] = useState(false);
  const newest = items[0].entry;
  const oldest = items[items.length - 1].entry;
  return (
    <li class="gw-phase-history-run">
      <button type="button" class="gw-phase-history-run-toggle" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} />
        <span>{t('vsc.phase.historyRoutine', { count: items.length, from: oldest.from, to: newest.to })}</span>
      </button>
      {isOpen && (
        <ol class="gw-phase-history gw-phase-history-nested">
          {items.map(({ entry, index }) => <HistoryEntry key={`${entry.time}-${index}`} entry={entry} notes={NO_NOTES} />)}
        </ol>
      )}
    </li>
  );
}

function HistoryRow({ row, notesOf }: { readonly row: HistoryItem; readonly notesOf: (index: number) => readonly ReviewComment[] }): JSX.Element {
  if (row.kind === 'run') {
    return <RoutineRun items={row.items} />;
  }
  const { entry, index } = row.item;
  return <HistoryEntry entry={entry} notes={notesOf(index)} />;
}

export function PhaseHistory({ history }: { readonly history: readonly PhaseTransition[] }): JSX.Element {
  const t = useT();
  const comments = useStore((s) => s.state?.comments ?? NO_COMMENTS);
  const placed = useMemo(() => placeRejectionNotes(history, rejectionNotes(comments)), [history, comments]);
  const rows = useMemo(() => groupHistory(history, new Set(placed.byTransition.keys())), [history, placed]);
  if (history.length === 0 && placed.unplaced.length === 0) {
    return <EmptyState icon="history" message={t('phase.noChangesRecorded')} />;
  }
  return (
    <>
      {placed.unplaced.length > 0 && <RejectionNotes notes={placed.unplaced} />}
      <ol class="gw-phase-history">
        {rows.map((row) => (
          <HistoryRow key={row.kind === 'run' ? `run-${row.items[0].index}` : `${row.item.entry.time}-${row.item.index}`} row={row} notesOf={(index) => placed.byTransition.get(index) ?? NO_NOTES} />
        ))}
      </ol>
    </>
  );
}
