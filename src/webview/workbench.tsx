import { createRoot } from 'react-dom/client';
import { Workbench } from './components/workbench/workbench';
import { WorkbenchController } from './workbench-controller';

const root = createRoot(document.getElementById('root')!);
root.render(<Workbench controller={new WorkbenchController(acquireVsCodeApi())} />);
window.addEventListener('pagehide', () => root.unmount(), { once: true });
