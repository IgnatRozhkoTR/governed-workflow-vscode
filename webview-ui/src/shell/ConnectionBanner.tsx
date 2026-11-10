import type { JSX } from 'preact';
import { Button, EmptyState, ErrorBanner, useToast } from '../components';
import { useT } from '../i18n/i18n';
import { rpc } from '../rpc/rpcClient';
import { useStore } from '../store/hooks';
import { store } from '../store/store';

function retryConnection(toast: ReturnType<typeof useToast>): void {
  void store.refreshState().catch(toast.error);
}

function switchWorkspace(toast: ReturnType<typeof useToast>): void {
  rpc.call('native.switchWorkspace', {}).catch(toast.error);
}

// Without a loaded workspace the error is the whole page (see NoWorkspace), so the banner stays out of its way.
export function ConnectionBanner(): JSX.Element | null {
  const t = useT();
  const toast = useToast();
  const connection = useStore((s) => s.connection);
  const hasState = useStore((s) => s.state !== null);
  if (connection.status === 'auth_required') {
    return (
      <div class="gw-connection-banner" role="alert">
        <span>{t('vsc.connection.authRequired')}</span>
        <Button size="sm" variant="primary" icon="key" label={t('vsc.common.setToken')} onClick={() => rpc.call('native.setToken', {}).catch(toast.error)} />
      </div>
    );
  }
  if (connection.status === 'error' && hasState) {
    return <ErrorBanner error={new Error(connection.message)} onRetry={() => retryConnection(toast)} />;
  }
  return null;
}

// A workspace that failed to load (an unknown project, say) shows the error alone, never beside a spinner, with a
// way to try again or pick another workspace.
export function NoWorkspace(): JSX.Element {
  const t = useT();
  const toast = useToast();
  const hasWorkspace = useStore((s) => s.workspace !== null);
  const connection = useStore((s) => s.connection);
  const switchButton = <Button variant="primary" icon="arrow-swap" label={t('header.switch')} onClick={() => switchWorkspace(toast)} />;
  if (connection.status === 'error') {
    const actions = <span class="gw-empty-state-actions">{switchButton}<Button icon="refresh" label={t('vsc.common.retry')} onClick={() => retryConnection(toast)} /></span>;
    return <EmptyState icon="error" message={connection.message} action={actions} />;
  }
  return hasWorkspace
    ? <EmptyState icon="loading" message={t('vsc.common.loading')} />
    : <EmptyState icon="folder" message={t('vsc.connection.noWorkspace')} action={switchButton} />;
}
