import type { DocumentSnapshot, EditorMessage } from '../shared/messages';

// The VS Code TextDocument is canonical. Keep a local draft until each edit is
// acknowledged; never replace a newer draft with an older response.
export class DocumentSession {
  version: number | undefined;
  base: string;
  text: string;
  pending: { id: number; text: string } | undefined;
  conflict: boolean;
  sequence: number;
  waiters: ((success: boolean) => void)[];
  constructor(readonly send: (message: Extract<EditorMessage, { type: 'edit' }>) => void, readonly changed: () => void) {
    this.version = undefined;
    this.base = ''; this.text = ''; this.pending = undefined;
    this.conflict = false; this.sequence = 0; this.waiters = [];
  }
  get dirty() { return this.text !== this.base; }
  edit(text: string) { this.text = text; this.changed(); }
  pump() {
    if (this.version === undefined || this.pending || this.conflict || !this.dirty) return;
    this.pending = { id: ++this.sequence, text: this.text };
    this.send({ type: 'edit', id: this.pending.id, version: this.version, text: this.text });
    this.changed();
  }
  receive(message: Pick<DocumentSnapshot, 'text' | 'version' | 'id' | 'rejected'>) {
    if (this.version !== undefined && message.version < this.version) return;
    const first = this.version === undefined;
    const pending = this.pending;
    const ack = pending && message.id === pending.id;
    const clean = !this.dirty && !this.pending && !this.conflict;
    if (ack) {
      if (message.rejected || message.text !== pending.text) this.conflict = true;
      this.pending = undefined;
    } else if (!first && !clean && message.text !== this.base) {
      this.conflict = true;
    }
    this.base = message.text;
    this.version = message.version;
    if (first || clean) this.text = this.base;
    this.changed();
    this.pump();
    if (this.conflict || (!this.pending && !this.dirty)) {
      this.waiters.splice(0).forEach(resolve => resolve(!this.conflict));
    }
  }
  flush(): Promise<boolean> {
    this.pump();
    if (this.conflict) return Promise.resolve(false);
    if (!this.pending && !this.dirty) return Promise.resolve(true);
    return new Promise(resolve => this.waiters.push(resolve));
  }
  resolve(useDraft: boolean) {
    if (this.pending) return;
    this.conflict = false;
    if (!useDraft) this.text = this.base;
    this.changed(); this.pump();
  }
}
