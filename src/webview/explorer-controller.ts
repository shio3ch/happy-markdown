import { isExplorerState } from '../shared/messages';
import type { SearchAction, ExplorerState, ExplorerMode } from '../shared/messages';
import type { WebviewApi } from './api';

export class ExplorerController {
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private composing = false;
  private current: ExplorerState & { initialized: boolean } = {
    type: 'state', mode: 'files', nodes: [], expandedIds: [], followActive: true, hasWorkspace: false, revealRevision: 0,
    busy: false, query: '', requestId: 0, status: '', results: [], initialized: false,
  };
  constructor(private readonly api: Pick<WebviewApi, 'postMessage'>) {}
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private publish(next: typeof this.current) {
    this.current = next;
    this.listeners.forEach(listener => listener());
  }
  connect(target: Window) {
    const receive = (event: MessageEvent<unknown>) => this.receive(event.data);
    target.addEventListener('message', receive);
    this.api.postMessage({ type: 'ready' });
    return () => target.removeEventListener('message', receive);
  }
  compositionStart = () => { this.composing = true; };
  compositionEnd = (value: string) => { this.composing = false; this.changeQuery(value); };
  changeQuery = (value: string) => {
    if (this.composing) { this.publish({ ...this.current, query: value }); return; }
    this.revision++;
    this.publish({ ...this.current, query: value, requestId: this.revision, busy: Boolean(value), results: [],
      status: value ? '検索中…' : '検索語を入力してください。' });
    this.api.postMessage({ type: 'query', value, requestId: this.revision });
  };
  selectMode = (mode: ExplorerMode) => this.api.postMessage({ type: 'mode', mode });
  expand = (id: string, expanded: boolean) => this.api.postMessage({ type: 'expand', id, expanded });
  follow = (enabled: boolean) => this.api.postMessage({ type: 'follow', enabled });
  refresh = () => this.api.postMessage({ type: 'refresh' });
  openFolder = () => this.api.postMessage({ type: 'openFolder' });
  action = (type: SearchAction, id: string) => this.api.postMessage({ type, id });
  receive(value: unknown) {
    if (!isExplorerState(value)) return;
    if (this.current.initialized && (value.requestId < this.revision || value.query !== this.current.query)) return;
    this.revision = value.requestId;
    this.publish({ ...value, initialized: true });
  }
}
