import type { NavTarget } from '@shared/navigation';
import { useToast } from '../components';
import { rpc } from '../rpc/rpcClient';
import { useNav } from '../store/hooks';

// Header and decision-bar jumps are deliberate picks of a tab, so they are remembered like a tab click.
export function useRememberedNavigate(): (target: NavTarget) => void {
  const toast = useToast();
  const [, navigate] = useNav();
  return (target) => {
    navigate(target);
    rpc.call('panel.rememberTab', { tab: target.tab }).catch(toast.error);
  };
}
