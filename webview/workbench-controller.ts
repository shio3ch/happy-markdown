import { isDocumentSnapshot, isImageResult, isRecord } from '../shared/messages';
import type { DocumentAction, DocumentSnapshot, EditorMessage } from '../shared/messages';
import type { WebviewApi } from './api';
import type { Format } from './formatting';
import { DocumentSession } from './session';

export interface EditorAdapter {
  setText(text: string): void;
  format(kind: Format, value?: number | string): void;
  focus(): void;
  measure(): void;
}

// 文書同期はReactの描画タイミングから独立させ、応答待ちの入力を保持する。
export class WorkbenchController {
  readonly session: DocumentSession;
  private readonly restored: Record<string, unknown> | undefined;
  private readonly listeners = new Set<() => void>();
  private editor?: EditorAdapter;
  private ready = false;
  private mode: 'edit' | 'preview';
  private switching = false;
  private imageBusy = false;
  private message = '';
  private snapshot?: DocumentSnapshot;
  private current;

  constructor(private readonly api: WebviewApi) {
    const restored = api.getState();
    this.restored = isRecord(restored) ? restored : undefined;
    this.mode = this.restored?.mode === 'edit' ? 'edit' : 'preview';
    this.session = new DocumentSession(this.send, this.publish);
    this.current = this.read();
  }

  private read() {
    return { ready: this.ready, mode: this.mode, switching: this.switching, imageBusy: this.imageBusy,
      message: this.message, snapshot: this.snapshot, conflict: this.session.conflict, pending: Boolean(this.session.pending) };
  }
  private publish = () => {
    this.editor?.setText(this.session.text);
    if (this.ready) this.api.setState({ mode: this.mode, draft: this.session.text, baseText: this.session.base });
    this.current = this.read();
    this.listeners.forEach(listener => listener());
  };
  getSnapshot = () => this.current;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  send = (message: EditorMessage) => this.api.postMessage(message);
  connect(target: Window) {
    const receive = (event: MessageEvent<unknown>) => this.receive(event.data);
    target.addEventListener('message', receive);
    this.send({ type: 'ready' });
    return () => target.removeEventListener('message', receive);
  }
  attachEditor(editor: EditorAdapter) {
    this.editor = editor;
    editor.setText(this.session.text);
    return () => { if (this.editor === editor) this.editor = undefined; };
  }
  edit = (text: string) => { this.session.edit(text); this.session.pump(); };
  resolve = (useDraft: boolean) => this.session.resolve(useDraft);
  format = (kind: Format, value?: number | string) => { if (this.ready) this.editor?.format(kind, value); };
  focusEditor = () => { this.editor?.measure(); this.editor?.focus(); };
  action = async (type: DocumentAction) => {
    if (this.ready && await this.session.flush()) this.send({ type });
  };
  switchMode = async () => {
    if (!this.ready || this.switching) return;
    this.switching = true;
    this.publish();
    try {
      if (await this.session.flush()) this.mode = this.mode === 'edit' ? 'preview' : 'edit';
    } finally { this.switching = false; this.publish(); }
  };
  pickImage = async () => {
    if (!this.ready || this.imageBusy) return;
    this.imageBusy = true;
    this.publish();
    if (!await this.session.flush()) { this.imageBusy = false; this.publish(); return; }
    this.send({ type: 'pickImage' });
  };
  receive(message: unknown) {
    if (isImageResult(message)) {
      this.imageBusy = false;
      if (message.path) this.editor?.format('image-file', message.path);
      if (message.message) this.message = message.message;
      this.editor?.focus();
      this.publish();
      return;
    }
    if (!isDocumentSnapshot(message) || (this.session.version !== undefined && message.version < this.session.version)) return;
    this.snapshot = message;
    this.message = message.message || '';
    this.session.receive(message);
    if (!this.ready) {
      if (this.restored && typeof this.restored.draft === 'string' && this.restored.draft !== this.restored.baseText) {
        this.session.edit(this.restored.draft);
        if (this.restored.baseText !== message.text) this.session.conflict = true;
        else this.session.pump();
      }
      this.ready = true;
    }
    this.publish();
  }
}
