import type { JSX } from 'preact';
import { useT } from '../i18n/i18n';
import { Icon } from './Icon';

export interface SpinnerProps {
  readonly label?: string;
}

export function Spinner({ label }: SpinnerProps): JSX.Element {
  const t = useT();
  return (
    <div class="gw-spinner" role="status">
      <Icon name="loading" spin />
      <span>{label ?? t('vsc.common.loading')}</span>
    </div>
  );
}
