import { PROTOCOL_VERSION, isLocale, type PanelBootstrap } from '@shared/protocol';
import { render } from 'preact';
import { rpc } from './rpc/rpcClient';
import { App } from './shell/App';
import { store } from './store/store';
import { TAB_MODULES } from './tabs';
import './styles/base.css';
import './styles/components.css';

const BOOTSTRAP_ELEMENT_ID = 'gw-bootstrap';
const ROOT_ELEMENT_ID = 'root';

class BootstrapError extends Error {}

function readBootstrap(): PanelBootstrap {
  const text = document.getElementById(BOOTSTRAP_ELEMENT_ID)?.textContent;
  if (text === undefined || text === null || text === '') {
    throw new BootstrapError('The panel bootstrap data is missing.');
  }
  const bootstrap = JSON.parse(text) as PanelBootstrap;
  if (bootstrap.protocol !== PROTOCOL_VERSION || !isLocale(bootstrap.locale)) {
    throw new BootstrapError('The panel bootstrap data does not match this panel version.');
  }
  return bootstrap;
}

function start(): void {
  const bootstrap = readBootstrap();
  store.initialize(bootstrap);
  rpc.onEvent((event) => store.applyHostEvent(event));
  rpc.ready();
  const root = document.getElementById(ROOT_ELEMENT_ID);
  if (root === null) {
    throw new BootstrapError('The panel root element is missing.');
  }
  render(<App modules={TAB_MODULES} />, root);
  void store.syncSnapshot();
}

try {
  start();
} catch (error) {
  (document.getElementById(ROOT_ELEMENT_ID) ?? document.body).textContent = error instanceof Error ? error.message : String(error);
}
