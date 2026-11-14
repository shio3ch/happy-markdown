import { createRoot } from 'react-dom/client';
import { Explorer } from './components/explorer/explorer';
import { ExplorerController } from './explorer-controller';

const root = createRoot(document.getElementById('root')!);
root.render(<Explorer controller={new ExplorerController(acquireVsCodeApi())} />);
window.addEventListener('pagehide', () => root.unmount(), { once: true });
