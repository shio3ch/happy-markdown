import type * as VSCode from 'vscode';
import type { ExplorerNode } from './types';

export function explorerKeybindingContext(vscode: typeof VSCode) {
  const previous = new Map<string, unknown>();
  const set = (key: string, value: unknown) => {
    const id = `happyMarkdown.explorer${key}`;
    if (previous.get(id) === value) return;
    previous.set(id, value);
    // Dispatch in event order; do not hold focus changes behind unrelated replies.
    const failed = () => { if (previous.get(id) === value) previous.delete(id); };
    try { void Promise.resolve(vscode.commands.executeCommand('setContext', id, value)).catch(failed); }
    catch { failed(); }
  };
  return {
    focus(focused: boolean) { set('TreeFocus', focused); },
    selection(node?: ExplorerNode, root = false) {
      set('HasSelection', Boolean(node)); set('FileSelected', Boolean(node && !node.children));
      set('FolderSelected', Boolean(node?.children)); set('RootSelected', root);
    },
    state(hasWorkspace: boolean, canPaste: boolean, cut: boolean, busy = false) {
      set('HasWorkspace', hasWorkspace); set('CanPaste', canPaste); set('HasCut', cut); set('Busy', busy);
    },
    reset() { this.focus(false); this.selection(); this.state(false, false, false); },
  };
}
