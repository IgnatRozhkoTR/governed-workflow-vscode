import { useDialogs, useToast } from '../../../components';
import { useT } from '../../../i18n/i18n';
import { rpc } from '../../../rpc/rpcClient';

export function useStartClaude(): () => Promise<void> {
  const t = useT();
  const dialogs = useDialogs();
  const toast = useToast();
  return async () => {
    const isConfirmed = await dialogs.confirm({
      title: t('vsc.settings.startConfirmTitle'),
      message: t('vsc.settings.startConfirmMessage'),
      confirmLabel: t('buttons.start'),
      danger: true,
    });
    if (!isConfirmed) {
      return;
    }
    try {
      await rpc.call('native.startClaude', { confirmed: true });
    } catch (error) {
      toast.error(error);
    }
  };
}
