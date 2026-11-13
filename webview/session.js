'use strict';

// The VS Code TextDocument is canonical. Keep a local draft until each edit is
// acknowledged; never replace a newer draft with an older response.
class DocumentSession {
  constructor(send, changed) {
    this.send = send; this.changed = changed; this.version = undefined;
    this.base = ''; this.text = ''; this.pending = undefined;
    this.conflict = false; this.sequence = 0; this.waiters = [];
  }
  get dirty() { return this.text !== this.base; }
  edit(text) { this.text = text; this.changed(); }
  pump() {
    if (this.version === undefined || this.pending || this.conflict || !this.dirty) return;
    this.pending = { id: ++this.sequence, text: this.text };
    this.send({ type: 'edit', id: this.pending.id, version: this.version, text: this.text });
    this.changed();
  }
  receive(message) {
    if (this.version !== undefined && message.version < this.version) return;
    const first = this.version === undefined;
    const ack = this.pending && message.id === this.pending.id;
    const clean = !this.dirty && !this.pending && !this.conflict;
    if (ack) {
      if (message.rejected || message.text !== this.pending.text) this.conflict = true;
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
  flush() {
    this.pump();
    if (this.conflict) return Promise.resolve(false);
    if (!this.pending && !this.dirty) return Promise.resolve(true);
    return new Promise(resolve => this.waiters.push(resolve));
  }
  resolve(useDraft) {
    if (this.pending) return;
    this.conflict = false;
    if (!useDraft) this.text = this.base;
    this.changed(); this.pump();
  }
}
module.exports = { DocumentSession };
