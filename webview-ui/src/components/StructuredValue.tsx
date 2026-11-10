import type { JSX } from 'preact';
import { useT } from '../i18n/i18n';
import { humanizeKey } from './humanizeKey';
import { Markdown } from './Markdown';

export interface StructuredValueProps {
  readonly value: unknown;
  readonly depth?: number;
}

type Scalar = string | number | boolean;
type FlatRecord = Readonly<Record<string, unknown>>;

const EMPTY_VALUE = '—';

function isScalar(value: unknown): value is Scalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isRecord(value: unknown): value is FlatRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFlatRecord(value: unknown): value is FlatRecord {
  return isRecord(value) && Object.values(value).every((field) => field === null || isScalar(field));
}

function sharedColumns(rows: readonly FlatRecord[]): readonly string[] | undefined {
  const columns = Object.keys(rows[0] ?? {});
  const isShared = columns.length > 0 && rows.every((row) => Object.keys(row).every((key) => columns.includes(key)));
  return isShared ? columns : undefined;
}

export function StructuredValue({ value, depth = 0 }: StructuredValueProps): JSX.Element {
  if (value === null || value === undefined || value === '') {
    return <span class="gw-muted">{EMPTY_VALUE}</span>;
  }
  if (typeof value === 'string') {
    return <Markdown source={value} compact />;
  }
  if (isScalar(value)) {
    return <span>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return <StructuredList items={value} depth={depth} />;
  }
  return <StructuredObject value={value as FlatRecord} depth={depth} />;
}

function StructuredList({ items, depth }: { readonly items: readonly unknown[]; readonly depth: number }): JSX.Element {
  const columns = items.length > 0 && items.every(isFlatRecord) ? sharedColumns(items as FlatRecord[]) : undefined;
  if (columns !== undefined) {
    return <StructuredTable rows={items as FlatRecord[]} columns={columns} />;
  }
  return (
    <ul class="gw-structured-list">
      {items.map((item, index) => <li key={index}><StructuredValue value={item} depth={depth + 1} /></li>)}
    </ul>
  );
}

function StructuredTable({ rows, columns }: { readonly rows: readonly FlatRecord[]; readonly columns: readonly string[] }): JSX.Element {
  const t = useT();
  return (
    <div class="gw-table-scroll">
      <table class="gw-structured-table">
        <thead><tr>{columns.map((column) => <th key={column}>{humanizeKey(t, column)}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{columns.map((column) => <td key={column}><StructuredValue value={row[column]} /></td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StructuredObject({ value, depth }: { readonly value: FlatRecord; readonly depth: number }): JSX.Element {
  const t = useT();
  return (
    <dl class={`gw-structured-object gw-structured-depth-${Math.min(depth, 3)}`}>
      {Object.entries(value).map(([key, field]) => (
        <div key={key} class="gw-structured-entry">
          <dt>{humanizeKey(t, key)}</dt>
          <dd><StructuredValue value={field} depth={depth + 1} /></dd>
        </div>
      ))}
    </dl>
  );
}
