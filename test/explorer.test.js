'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTree, findMatches, registerExplorer } = require('../dist/src/explorer');
const uri = path => ({ path, fsPath: path, toString: () => `file://${path}` });
const folders = [{ name: 'docs', uri: uri('/docs') }, { name: 'other', uri: uri('/other') }];
const api = {
  Uri: { joinPath: (base, ...parts) => uri(`${base.path}/${parts.join('/')}`) },
  workspace: { getWorkspaceFolder: file => folders.find(folder => file.path.startsWith(folder.uri.path + '/')) },
};

test('groups Markdown paths, sorts folders first and preserves Unicode names', () => {
  const result = buildTree(['/docs/z.md', '/docs/入門/手順.md', '/docs/a.md', '/outside/no.md'].map(uri), [folders[0]], api);
  assert.deepEqual(result.map(node => node.label), ['入門', 'a.md', 'z.md']);
  assert.equal(result[0].children[0].label, '手順.md');
  assert.equal(result[0].children[0].uri.path, '/docs/入門/手順.md');
});

test('keeps workspace roots separate and handles empty workspaces', () => {
  const result = buildTree(['/docs/readme.md', '/other/readme.md'].map(uri), folders, api);
  assert.equal(result.length, 2);
  assert.equal(result[0].children[0].uri.path, '/docs/readme.md');
  assert.equal(result[1].children[0].uri.path, '/other/readme.md');
  assert.deepEqual(buildTree([], [], api), []);
  assert.deepEqual(buildTree([], [folders[0]], api), []);
});

test('search matches literal Japanese and case-insensitive text with CRLF line numbers', () => {
  assert.deepEqual(findMatches('見出し\r\n本文 ABC\r\na.c\r\nabc', 'AbC'), [{ line: 2, text: '本文 ABC' }, { line: 4, text: 'abc' }]);
  assert.deepEqual(findMatches('a.c\nabc', 'a.c'), [{ line: 1, text: 'a.c' }]);
  assert.deepEqual(findMatches('日本語の本文', '本文'), [{ line: 1, text: '日本語の本文' }]);
  assert.deepEqual(findMatches('本文', ''), []);
});

const { explorerHarness, uri: resource } = require('./explorer-harness');
const { waitFor } = require('./webview-helper');

test('registers one Webview explorer, caches files and opens only known file IDs', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await h.ready();
    assert.equal(h.searches, 1);
    assert.equal(h.current.nodes.length, 2);
    assert.equal(h.view.description, 'ファイル一覧');
    await h.receive({ type: 'open', id: h.current.nodes[0].id });
    assert.equal(h.executed[0][0], 'vscode.openWith');
    assert.equal(h.executed[0][2], 'happyMarkdown.preview');
    assert.equal(h.executed[0][3].viewColumn, -1);
    await h.receive({ type: 'open', id: 'file:///outside/forged.md' });
    assert.equal(h.executed.length, 1);
    await h.commands.get('happyMarkdown.refreshExplorer')();
    assert.equal(h.searches, 2);
    await h.receive({ type: 'source', id: h.current.nodes[0].id });
    assert.equal(h.executed[1][2], 'default');
  } finally { h.dispose(); }
});

test('switches React sidebar modes and persists bookmarks through serialized changes', async () => {
  const h = explorerHarness();
  try {
    await h.ready();
    await h.setQuery('hello'); await h.mode('search');
    assert.equal(h.current.results.length, 2);
    assert.equal(h.current.results[0].matches[0].text, 'HELLO unsaved');
    await h.receive({ type: 'bookmark', id: h.current.results[1].id });
    await h.mode('bookmarks');
    assert.equal(h.current.nodes.length, 1);
    assert.equal(h.current.nodes[0].bookmarked, true);
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), ['file:///docs/second.markdown']);
    assert.match(h.current.nodes[0].path, /docs\/second/);
    await h.mode('files'); assert.equal(h.current.nodes.length, 2);
    await h.mode('search'); assert.equal(h.current.query, 'hello');
    await Promise.all([
      h.commands.get('happyMarkdown.addBookmark')({ uri: h.files[0] }),
      h.commands.get('happyMarkdown.removeBookmark')({ uri: h.files[1] }),
    ]);
    await h.mode('bookmarks');
    assert.deepEqual(h.current.nodes.map(node => node.id), ['file:///docs/first.md']);
  } finally { h.dispose(); }
});

test('restores bookmarks, hides missing files and retains saved state on storage failure', async () => {
  const h = explorerHarness(['file:///docs/first.md', 'file:///docs/missing.md']);
  try {
    await h.mode('bookmarks');
    assert.equal(h.current.nodes.length, 1);
    const update = h.context.workspaceState.update;
    h.context.workspaceState.update = async () => { throw new Error('storage failure'); };
    await h.receive({ type: 'bookmark', id: h.current.nodes[0].id });
    assert.equal(h.current.nodes[0].bookmarked, true);
    assert.match(h.warnings[0], /保存できませんでした/);
    h.context.workspaceState.update = update;
    await h.receive({ type: 'bookmark', id: h.current.nodes[0].id });
    assert.equal(h.current.nodes.length, 0);
  } finally { h.dispose(); }
});

test('reports unreadable documents and ignores earlier searches after mode or query changes', async () => {
  const h = explorerHarness();
  try {
    h.texts.delete(h.files[1].path);
    await h.setQuery('hello'); await h.mode('search');
    assert.equal(h.current.results.length, 1);
    assert.match(h.current.status, /1ファイルを読み込めませんでした/);
    let release;
    h.vscode.workspace.openTextDocument = () => new Promise(resolve => { release = resolve; });
    const pending = h.commands.get('happyMarkdown.refreshExplorer')();
    await waitFor(() => release);
    await h.mode('files');
    release({ getText: () => 'hello' }); await pending;
    assert.equal(h.current.mode, 'files'); assert.equal(h.current.nodes.length, 2);
  } finally { h.dispose(); }
});

test('retains folder expansion and publishes theme icons and child counts across refreshes', async () => {
  const h = explorerHarness();
  try {
    h.files.push(resource('/docs/nested/guide.md'));
    await h.ready();
    const folder = h.current.nodes.find(node => node.children);
    assert.equal(folder.children.length, 1);
    assert.match(folder.icon.light, /light\/folder.svg$/);
    await h.receive({ type: 'expand', id: folder.id, expanded: true });
    assert.ok(h.current.expandedIds.includes(folder.id));
    assert.match(h.current.nodes[0].icon.dark, /dark\/folder-open.svg$/);
    await h.mode('bookmarks'); await h.mode('files');
    assert.ok(h.current.expandedIds.includes(folder.id));
    await h.receive({ type: 'expand', id: folder.id, expanded: false });
    assert.equal(h.current.expandedIds.includes(folder.id), false);
    const file = h.current.nodes.find(node => !node.children);
    await h.receive({ type: 'bookmark', id: file.id });
    assert.match(h.current.nodes.find(node => node.id === file.id).icon.dark, /document-bookmarked.svg$/);
    const before = h.current.expandedIds;
    await h.receive({ type: 'expand', id: file.id, expanded: true });
    assert.deepEqual(h.current.expandedIds, before);
  } finally { h.dispose(); }
});

test('follows source/custom tabs, expands ancestors and keeps hidden views closed', async () => {
  const h = explorerHarness();
  try {
    const nested = resource('/docs/nested/deep/guide.md'); h.files.push(nested);
    await h.setActive(new h.vscode.TabInputCustom(nested));
    assert.equal(h.current.revealId, nested.toString());
    assert.equal(h.current.expandedIds.length, 2);
    assert.equal(h.current.nodes[0].children[0].children[0].active, true);
    await h.setActive(new h.vscode.TabInputText(h.files[0]), true);
    assert.equal(h.current.revealId, h.files[0].toString());
    h.setVisible(false);
    const previous = h.current.revealRevision;
    await h.setActive(new h.vscode.TabInputCustom(h.files[1]));
    assert.equal(h.current.revealRevision, previous);
    assert.equal(h.executed.length, 0);
    h.setVisible(true);
    await waitFor(() => h.current.revealId === h.files[1].toString() && !h.current.busy);
    await h.setActive(new h.vscode.TabInputText(resource('/docs/script.js')));
    assert.equal(h.current.nodes.some(node => node.active), false);
  } finally { h.dispose(); }
});

test('follows the latest active tab when a prior file lookup is still pending', async () => {
  const h = explorerHarness();
  try {
    let release;
    h.vscode.workspace.findFiles = () => new Promise(resolve => { release = resolve; });
    const first = h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    const second = h.setActive(new h.vscode.TabInputCustom(h.files[1]));
    release(h.files); await Promise.all([first, second]);
    assert.equal(h.current.revealId, h.files[1].toString());
    assert.equal(h.current.nodes.filter(node => node.active).length, 1);
  } finally { h.dispose(); }
});

test('follow preference persists, resumes at the current document and survives storage errors', async () => {
  const h = explorerHarness([], false);
  try {
    await h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    assert.equal(h.current.nodes[0].active, false);
    const update = h.context.workspaceState.update;
    h.context.workspaceState.update = async () => { throw new Error('storage failure'); };
    await h.receive({ type: 'follow', enabled: true });
    assert.equal(h.current.followActive, false);
    assert.match(h.warnings[0], /追従設定を保存できませんでした/);
    h.context.workspaceState.update = update;
    await h.receive({ type: 'follow', enabled: true });
    assert.equal(h.state.get('happyMarkdown.followActive'), true);
    assert.equal(h.current.revealId, h.files[0].toString());
    await h.commands.get('happyMarkdown.disableFollowActive')();
    assert.equal(h.current.followActive, false);
    assert.equal(h.current.nodes.some(node => node.active), false);
  } finally { h.dispose(); }
});

test('search highlights matching active documents without switching away from search', async () => {
  const h = explorerHarness();
  try {
    await h.setQuery('unsaved'); await h.mode('search');
    await h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    assert.equal(h.current.results[0].active, true);
    assert.equal(h.current.mode, 'search');
    await h.setActive(new h.vscode.TabInputCustom(h.files[1]));
    assert.equal(h.current.results[0].active, false);
    assert.equal(h.current.revealId, undefined);
  } finally { h.dispose(); }
});

test('input triggers search and rejects malformed, duplicate and unknown file actions', async () => {
  const h = explorerHarness();
  try {
    await h.mode('search'); await h.setQuery('hello');
    await waitFor(() => !h.current.busy && h.current.results.length === 2);
    const state = h.current;
    for (const message of [null, { type: 'mode', mode: 'invalid' }, { type: 'query', value: 'other', requestId: -1 },
      { type: 'query', value: 'other', requestId: state.requestId }, { type: 'query', value: {}, requestId: state.requestId + 1 },
      { type: 'bookmark', id: 'file:///outside/untrusted.md' }, { type: 'expand', id: state.results[0].id, expanded: 'yes' }]) await h.receive(message);
    assert.equal(h.current.query, 'hello');
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), []);
    await h.receive({ type: 'bookmark', id: state.results[0].id });
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [state.results[0].id]);
    await h.setQuery(''); assert.equal(h.current.results.length, 0);
  } finally { h.dispose(); }
});

test('slow earlier searches never overwrite newer input', async () => {
  const h = explorerHarness();
  try {
    let release;
    const open = h.vscode.workspace.openTextDocument;
    h.vscode.workspace.openTextDocument = async file => { if (!release) await new Promise(resolve => { release = resolve; }); return open(file); };
    await h.setQuery('other'); const pending = h.mode('search');
    await waitFor(() => release);
    await h.setQuery('unsaved'); release(); await pending;
    await waitFor(() => !h.current.busy && h.current.query === 'unsaved');
    assert.equal(h.current.results.length, 1);
    assert.equal(h.current.results[0].label, 'first.md');
  } finally { h.dispose(); }
});

test('workspace changes, lookup failures and empty workspaces can be refreshed safely', async () => {
  const h = explorerHarness();
  try {
    const find = h.vscode.workspace.findFiles;
    h.vscode.workspace.findFiles = async () => { throw new Error('file search failed'); };
    await h.ready(); assert.match(h.current.status, /再試行/);
    h.vscode.workspace.findFiles = find;
    await h.callbacks.workspace(); assert.equal(h.current.nodes.length, 2);
    h.vscode.workspace.workspaceFolders = [];
    await h.commands.get('happyMarkdown.refreshExplorer')();
    assert.equal(h.current.hasWorkspace, false);
    await h.receive({ type: 'openFolder' });
    assert.equal(h.executed.at(-1)[0], 'vscode.openFolder');
    const roots = h.view.webview.options.localResourceRoots.map(item => item.path);
    assert.deepEqual(roots, ['/extension/styles', '/extension/dist', '/extension/media/explorer']);
    assert.match(h.view.webview.html, /img-src test:/);
  } finally { h.dispose(); }
});

test('contributes a single React Webview instead of native TreeView and a separate search view', () => {
  const pkg = require('../package.json');
  assert.deepEqual(pkg.contributes.views.happyMarkdown, [{ type: 'webview', id: 'happyMarkdown.explorer', name: 'Markdownエクスプローラー' }]);
});
