import { randomBytes } from 'node:crypto';
import type * as VSCode from 'vscode';
import { isSearchMessage } from '../shared/messages';
import type { SearchAction, SearchState } from '../shared/messages';
import type { ResourceUri, SearchNode } from './types';

export function searchShell(webview: Pick<VSCode.Webview, 'cspSource'>, resource: ResourceUri) {
  const nonce = randomBytes(16).toString('hex');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${resource('styles/explorer-search.css')}"></head><body>
<main aria-label="Markdown本文検索">
<div class="search-box" role="search"><label for="query">本文を検索</label><div class="input-row"><input id="query" type="search" disabled placeholder="検索する言葉を入力" autocomplete="off" spellcheck="false" aria-describedby="search-help"><button id="clear" type="button" title="検索語をクリア" aria-label="検索語をクリア">×</button></div><p id="search-help">全Markdownから検索 · 大文字・小文字を区別しない</p></div>
<p id="status" role="status" aria-live="polite"></p><div id="results" aria-label="検索結果"></div>
</main><script nonce="${nonce}" src="${resource('dist/explorer-search.js')}"></script></body></html>`;
}

export function registerSearchView(context: VSCode.ExtensionContext, vscode: typeof VSCode, handlers: {
  query(value: string, id: number): unknown;
  action(type: SearchAction, node: SearchNode): unknown;
}) {
  let view: VSCode.WebviewView | undefined;
  let state: SearchState = { type: 'state', busy: false, query: '', requestId: 0, status: '検索語を入力してください。', results: [] };
  let allowed = new Map<string, SearchNode>();
  const provider: VSCode.WebviewViewProvider = {
    resolveWebviewView(value) {
      view = value;
      value.description = '検索';
      const webview = value.webview;
      webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'styles'), vscode.Uri.joinPath(context.extensionUri, 'dist')] };
      webview.html = searchShell(webview, path => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, path)));
      context.subscriptions.push(webview.onDidReceiveMessage((message: unknown) => {
        if (!isSearchMessage(message)) return;
        if (message.type === 'ready') return webview.postMessage(state);
        if (message.type === 'query' && typeof message.value === 'string' && Number.isSafeInteger(message.requestId) && message.requestId > state.requestId) {
          return handlers.query(message.value, message.requestId);
        }
        if (message.type === 'open' || message.type === 'source' || message.type === 'bookmark') {
          const node = allowed.get(message.id);
          if (node) return handlers.action(message.type, node);
        }
      }), value.onDidChangeVisibility(() => {
        if (value.visible) void webview.postMessage(state);
      }));
    },
  };
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('happyMarkdown.search', provider, { webviewOptions: { retainContextWhenHidden: true } }));
  return {
    render(next: Omit<SearchState, 'type' | 'results'> & { bookmarks: string[]; activeUri?: string }, nodes: SearchNode[]) {
      allowed = new Map(nodes.map(node => [node.uri.toString(), node]));
      state = { type: 'state', ...next, results: nodes.map(node => ({ id: node.uri.toString(), label: node.label,
        path: node.description, count: node.matches.length, matches: node.matches.slice(0, 3),
        bookmarked: next.bookmarks.includes(node.uri.toString()), active: next.activeUri === node.uri.toString() })) };
      if (view) void view.webview.postMessage(state);
    },
  };
}
