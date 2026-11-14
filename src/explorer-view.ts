import { randomBytes } from 'node:crypto';
import type * as VSCode from 'vscode';
import { isExplorerMessage } from '../shared/messages';
import type { ExplorerMode, ExplorerState, FileEntry, SearchAction } from '../shared/messages';
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
  refresh(): unknown; action(type: SearchAction, node: ExplorerNode): unknown;
}) {
  let view: VSCode.WebviewView | undefined, state: ExplorerState | undefined;
  let allowed = new Map<string, ExplorerNode>();
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
          case 'mode': return handlers.mode(message.mode);
          case 'refresh': return handlers.refresh();
          case 'follow': return handlers.follow(message.enabled);
          case 'openFolder': return vscode.commands.executeCommand('vscode.openFolder');
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
      }), value.onDidChangeVisibility(() => { if (value.visible) void handlers.ready(); }));
    },
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('happyMarkdown.explorer', provider, { webviewOptions: { retainContextWhenHidden: true } }));
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
          icon: { light: resource(icon, 'light'), dark: resource(icon, 'dark') }, children: node.children?.map(serialize) };
      };
      const entries = nodes.map(serialize);
      state = { ...next, type: 'state', nodes: next.mode === 'search' ? [] : entries,
        results: next.mode !== 'search' ? [] : nodes.map(node => ({ id: node.uri.toString(), label: node.label, path: node.description || node.uri.fsPath,
          count: node.matches?.length || 0, matches: node.matches?.slice(0, 3) || [], bookmarked: next.bookmarks.includes(node.uri.toString()), active: next.activeUri === node.uri.toString() })) };
      if (view) {
        view.description = { files: 'ファイル一覧', search: '検索', bookmarks: 'ブックマーク' }[next.mode];
        void view.webview.postMessage(state);
      }
    },
  };
}
