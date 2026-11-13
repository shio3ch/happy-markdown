'use strict';
const { randomBytes } = require('node:crypto');

function searchShell(webview, resource) {
  const nonce = randomBytes(16).toString('hex');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${resource('styles/explorer-search.css')}"></head><body>
<main aria-label="Markdown本文検索">
<div class="search-box" role="search"><label for="query">本文を検索</label><div class="input-row"><input id="query" type="search" disabled placeholder="検索する言葉を入力" autocomplete="off" spellcheck="false" aria-describedby="search-help"><button id="clear" type="button" title="検索語をクリア" aria-label="検索語をクリア">×</button></div><p id="search-help">全Markdownから検索 · 大文字・小文字を区別しない</p></div>
<p id="status" role="status" aria-live="polite"></p><div id="results" aria-label="検索結果"></div>
</main><script nonce="${nonce}" src="${resource('dist/explorer-search.js')}"></script></body></html>`;
}

function registerSearchView(context, vscode, handlers) {
  let view, state = { type: 'state', busy: false, query: '', requestId: 0, status: '検索語を入力してください。', results: [] }, allowed = new Map();
  const provider = {
    resolveWebviewView(value) {
      view = value;
      value.description = '検索';
      const webview = value.webview;
      webview.options = { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'styles'), vscode.Uri.joinPath(context.extensionUri, 'dist')] };
      webview.html = searchShell(webview, path => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, path)));
      context.subscriptions.push(webview.onDidReceiveMessage(message => {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'ready') return webview.postMessage(state);
        if (message.type === 'query' && typeof message.value === 'string' && Number.isSafeInteger(message.requestId) && message.requestId > state.requestId) {
          return handlers.query(message.value, message.requestId);
        }
        if (['open', 'source', 'bookmark'].includes(message.type) && typeof message.id === 'string') {
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
    render(next, nodes) {
      allowed = new Map(nodes.map(node => [node.uri.toString(), node]));
      state = { type: 'state', ...next, results: nodes.map(node => ({ id: node.uri.toString(), label: node.label,
        path: node.description, count: node.matches.length, matches: node.matches.slice(0, 3),
        bookmarked: next.bookmarks.includes(node.uri.toString()), active: next.activeUri === node.uri.toString() })) };
      if (view) void view.webview.postMessage(state);
    },
  };
}

module.exports = { registerSearchView, searchShell };
