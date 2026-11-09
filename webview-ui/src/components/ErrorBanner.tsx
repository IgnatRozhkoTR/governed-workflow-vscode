import type { JSX } from 'preact';
import { useT } from '../i18n/i18n';
import { describeError } from '../lib/format';
import { rpc, RpcError } from '../rpc/rpcClient';
import { Button } from './Button';
import { Icon } from './Icon';

export interface ErrorBannerProps {
  readonly error: unknown;
  readonly onRetry?: () => void;
}

const AUTH_REQUIRED_CODE = 'auth_required';

export function ErrorBanner({ error, onRetry }: ErrorBannerProps): JSX.Element {
  const t = useT();
  const isAuthError = error instanceof RpcError && error.code === AUTH_REQUIRED_CODE;
  return (
    <div class="gw-error-banner" role="alert">
      <Icon name="error" />
      <span class="gw-error-banner-message">{describeError(error)}</span>
      {isAuthError && (
        <Button size="sm" icon="key" label={t('vsc.common.setToken')} onClick={() => rpc.call('native.setToken', {})} />
      )}
      {onRetry !== undefined && <Button size="sm" variant="ghost" icon="refresh" label={t('vsc.common.retry')} onClick={onRetry} />}
    </div>
  );
}
