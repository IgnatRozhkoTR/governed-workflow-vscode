import type { JSX } from 'preact';
import { Button, EmptyState, ErrorBanner, useToast } from '../components';
import { useT } from '../i18n/i18n';
import { rpc } from '../rpc/rpcClient';
import { useStore } from '../store/hooks';
import { store } from '../store/store';

export function ConnectionBanner(): JSX.Element | null {
  const t = useT();
  const toast = useToast();
  const connection = useStore((s) => s.connection);
  if (connection.status === 'auth_required') {
    return (
      <div class="gw-connection-banner" role="alert">
        <span>{t('vsc.connection.authRequired')}</span>
        <Button size="sm" variant="primary" icon="key" label={t('vsc.common.setToken')} onClick={() => rpc.call('native.setToken', {}).catch(toast.error)} />
      </div>
    );
  }
  if (connection.status === 'error') {
    return <ErrorBanner error={new Error(connection.message)} onRetry={() => void store.refreshState().catch(toast.error)} />;
  }
  return null;
}

export function NoWorkspace(): JSX.Element {
  const t = useT();
  const toast = useToast();
  const hasWorkspace = useStore((s) => s.workspace !== null);
  const action = hasWorkspace
    ? undefined
    : <Button variant="primary" icon="arrow-swap" label={t('header.switch')} onClick={() => rpc.call('native.switchWorkspace', {}).catch(toast.error)} />;
  return <EmptyState icon={hasWorkspace ? 'loading' : 'folder'} message={t(hasWorkspace ? 'vsc.common.loading' : 'vsc.connection.noWorkspace')} action={action} />;
}
