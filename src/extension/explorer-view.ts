import { randomBytes } from 'node:crypto';
import type * as VSCode from 'vscode';
import { explorerKeybindingContext } from './explorer-keybindings';
import { isExplorerMessage, isRecord } from '../shared/messages';
import type { ExplorerMode, ExplorerState, FileEntry, ExplorerAction, FileOperation, ExplorerFocus } from '../shared/messages';
import type { ExplorerNode, ResourceUri } from './types';

export function explorerShell(webview: Pick<VSCode.Webview, 'cspSource'>, resource: ResourceUri) {
  const nonce = randomBytes(16).toString('hex');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource}; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${resource('styles/explorer.css')}"></head><body>
<div id="root"></div><script nonce="${nonce}" src="${resource('dist/explorer.js')}"></script></body></html>`;
}

type ViewState = Omit<ExplorerState, 'type' | 'results' | 'nodes'> & { bookmarks: string[]; activeUri?: string };
export function registerExplorerView(context: VSCode.ExtensionContext, vscode: typeof VSCode, handlers: {
  ready(): unknown; query(value: string, id: number): unknown; mode(value: ExplorerMode): unknown;
  expand(node: ExplorerNode, expanded: boolean): unknown; follow(enabled: boolean): unknown;
  cancelCut(): unknown; refresh(): unknown; action(type: ExplorerAction, node: ExplorerNode): unknown;
  fileOperation(action: FileOperation, node?: ExplorerNode): unknown; move(node: ExplorerNode, target?: ExplorerNode): unknown;
}) {
  let view: VSCode.WebviewView | undefined, state: ExplorerState | undefined;
  const keyboardContext = explorerKeybindingContext(vscode);
  let treeFocused = false, pendingOperations = 0;
  let selectedId: string | undefined;
  let allowed = new Map<string, ExplorerNode>();
  function syncKeyboardContext() {
    const node = selectedId ? allowed.get(selectedId) : undefined;
    keyboardContext.selection(node, Boolean(node && vscode.workspace.workspaceFolders?.some(folder => folder.uri.toString() === node.uri.toString())));
    keyboardContext.state(Boolean(state?.hasWorkspace), Boolean(state?.canPaste), Boolean(state?.cutId), pendingOperations > 0);
  }
  function fromKeybindingAllowed(args: unknown) {
    return !isRecord(args) || args.fromKeybinding !== true || (treeFocused && view?.visible && pendingOperations === 0);
  }
  async function fileOperation(action: FileOperation, node?: ExplorerNode) {
    pendingOperations++; syncKeyboardContext();
    try { await handlers.fileOperation(action, node); }
    finally { pendingOperations--; syncKeyboardContext(); }
    if (view?.visible && (action === 'rename' || action === 'delete')) {
      const id = selectedId || (action === 'rename' ? state?.revealId : node ? vscode.Uri.joinPath(node.uri, '..').toString() : undefined);
      await view.webview.postMessage({ type: 'focusTree', id } satisfies ExplorerFocus);
    }
  }
  const provider: VSCode.WebviewViewProvider = {
    resolveWebviewView(value) {
      view = value;
      const webview = value.webview;
      const resource = (path: string) => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, path));
      webview.options = { enableScripts: true, localResourceRoots: ['styles', 'dist', 'media/explorer'].map(path => vscode.Uri.joinPath(context.extensionUri, path)) };
      webview.html = explorerShell(webview, resource);
      context.subscriptions.push(webview.onDidReceiveMessage((message: unknown) => {
        if (!isExplorerMessage(message)) return;
        switch (message.type) {
          case 'ready': return handlers.ready();
          case 'query': if (message.requestId > (state?.requestId ?? 0)) return handlers.query(message.value, message.requestId); return;
          case 'mode': selectedId = undefined; treeFocused = false; keyboardContext.focus(false); syncKeyboardContext(); return handlers.mode(message.mode);
          case 'treeFocus': treeFocused = message.focused && value.visible; keyboardContext.focus(treeFocused); return;
          case 'selection': if (message.id === undefined || allowed.has(message.id)) { selectedId = message.id; syncKeyboardContext(); } return;
          case 'refresh': return handlers.refresh();
          case 'follow': return handlers.follow(message.enabled);
          case 'openFolder': return vscode.commands.executeCommand('vscode.openFolder');
          case 'fileOperation': {
            const node = message.id === undefined ? undefined : allowed.get(message.id);
            if (message.id !== undefined && !node) return;
            return fileOperation(message.action, node);
          }
          case 'move': {
            const node = allowed.get(message.id), target = message.targetId === undefined ? undefined : allowed.get(message.targetId);
            if (!node || node.children || (message.targetId !== undefined && !target?.children)) return;
            return handlers.move(node, target);
          }
          case 'expand': {
            const node = allowed.get(message.id);
            if (node?.children) return handlers.expand(node, message.expanded);
            return;
          }
          default: {
            const node = allowed.get(message.id);
            if (node && !node.children) return handlers.action(message.type, node);
          }
        }
      }), value.onDidChangeVisibility(() => { if (value.visible) void handlers.ready(); else { treeFocused = false; keyboardContext.focus(false); } }));
    },
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('happyMarkdown.explorer', provider, { webviewOptions: { retainContextWhenHidden: true } }));
  const fileCommands = ['newFile', 'newFolder', 'duplicate', 'copy', 'cut', 'paste', 'copyPath', 'copyRelativePath', 'rename', 'delete'] as const;
  for (const action of fileCommands) context.subscriptions.push(vscode.commands.registerCommand(`happyMarkdown.explorer.${action}`, (args: unknown) => {
    if (!fromKeybindingAllowed(args)) return;
    if (!view?.visible) return;
    const node = selectedId ? allowed.get(selectedId) : undefined;
    if (!node && !['newFile', 'newFolder', 'paste'].includes(action)) return;
    return fileOperation(action, node);
  }));
  for (const action of ['openTab', 'openSide', 'openPreview'] as const) context.subscriptions.push(vscode.commands.registerCommand(`happyMarkdown.explorer.${action}`, (args: unknown) => {
    if (!fromKeybindingAllowed(args)) return;
    const node = selectedId ? allowed.get(selectedId) : undefined;
    if (view?.visible && node && !node.children) return handlers.action(action, node);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('happyMarkdown.explorer.cancelCut', (args: unknown) => { if (fromKeybindingAllowed(args)) return handlers.cancelCut(); }));
  for (const command of ['contextMenu', 'toggleFolder'] as const) context.subscriptions.push(vscode.commands.registerCommand(`happyMarkdown.explorer.${command}`, (args: unknown) => {
    if (!view?.visible || !fromKeybindingAllowed(args)) return;
    const node = selectedId ? allowed.get(selectedId) : undefined;
    if (command === 'toggleFolder' && !node?.children) return;
    return view.webview.postMessage({ type: 'treeCommand', command });
  }));
  context.subscriptions.push({ dispose() { treeFocused = false; keyboardContext.reset(); } });
  return {
    get visible() { return view?.visible === true; },
    render(next: ViewState, nodes: ExplorerNode[]) {
      allowed = new Map();
      const resource = (name: string, theme: string) => view?.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'explorer', theme, `${name}.svg`)).toString() || '';
      const serialize = (node: ExplorerNode): FileEntry => {
        const id = node.uri.toString(), bookmarked = next.bookmarks.includes(id);
        allowed.set(id, node);
        const icon = node.children ? next.expandedIds.includes(id) ? 'folder-open' : 'folder' : bookmarked ? 'document-bookmarked' : 'document';
        return { id, label: node.label, path: node.description || node.uri.fsPath, bookmarked, active: next.activeUri === id,
          icon: { light: resource(icon, 'light'), dark: resource(icon, 'dark') }, root: Boolean(vscode.workspace.workspaceFolders?.some(folder => folder.uri.toString() === id)), children: node.children?.map(serialize) };
      };
      const entries = nodes.map(serialize);
      if (selectedId && !allowed.has(selectedId)) selectedId = undefined;
      state = { ...next, type: 'state', nodes: next.mode === 'search' ? [] : entries,
        results: next.mode !== 'search' ? [] : nodes.map(node => ({ id: node.uri.toString(), label: node.label, path: node.description || node.uri.fsPath,
          count: node.matches?.length || 0, matches: node.matches?.slice(0, 3) || [], bookmarked: next.bookmarks.includes(node.uri.toString()), active: next.activeUri === node.uri.toString() })) };
      syncKeyboardContext();
      if (view) {
        view.description = { files: 'ファイル一覧', search: '検索', bookmarks: 'ブックマーク' }[next.mode];
        void view.webview.postMessage(state);
      }
    },
  };
}
