import type { ComponentChildren, JSX } from 'preact';
import { useT } from '../i18n/i18n';
import type { Resource } from '../store/hooks';
import { EmptyState } from './EmptyState';
import { ErrorBanner } from './ErrorBanner';
import { Spinner } from './Spinner';

export interface ResourceViewProps<T> {
  readonly resource: Resource<T>;
  readonly empty?: (data: T) => boolean;
  readonly emptyMessage?: string;
  readonly children: (data: T) => ComponentChildren;
}

export function ResourceView<T>({ resource, empty, emptyMessage, children }: ResourceViewProps<T>): JSX.Element {
  const t = useT();
  const { data, error, reload } = resource;
  if (data === undefined) {
    return error === undefined ? <Spinner /> : <ErrorBanner error={error} onRetry={reload} />;
  }
  return (
    <>
      {error !== undefined && <ErrorBanner error={error} onRetry={reload} />}
      {empty?.(data) === true ? <EmptyState icon="info" message={emptyMessage ?? t('vsc.common.empty')} /> : children(data)}
    </>
  );
}
