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

test('registers explorer, caches search, refreshes and opens the selected document in the active column', async () => {
  const commands = new Map();
  const executed = [];
  let provider, searches = 0, events = 0, workspaceChanged;
  const disposable = { dispose() {} };
  const vscode = {
    ...api,
    TabInputText: class { constructor(uri) { this.uri = uri; } },
    TabInputCustom: class { constructor(uri) { this.uri = uri; } },
    EventEmitter: class { event = () => disposable; fire() { events++; } dispose() {} },
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    ViewColumn: { Active: -1 },
    window: { registerWebviewViewProvider: () => disposable, tabGroups: { activeTabGroup: {}, onDidChangeTabs: () => disposable, onDidChangeTabGroups: () => disposable }, createTreeView: (id, options) => { provider = options.treeDataProvider; return { ...disposable, onDidExpandElement: () => disposable, onDidCollapseElement: () => disposable, onDidChangeVisibility: () => disposable }; } },
    commands: {
      registerCommand: (id, handler) => { commands.set(id, handler); return disposable; },
      executeCommand: (...args) => { if (args[0] !== 'setContext') executed.push(args); },
    },
    workspace: {
      ...api.workspace, workspaceFolders: [folders[0]],
      findFiles: async (include, exclude) => {
        assert.match(include, /markdown/);
        assert.match(exclude, /node_modules/);
        searches++;
        return [uri('/docs/readme.md')];
      },
      createFileSystemWatcher: () => ({ ...disposable, onDidCreate: () => disposable, onDidDelete: () => disposable, onDidChange: () => disposable }),
      onDidChangeWorkspaceFolders: handler => { workspaceChanged = handler; return disposable; },
      onDidChangeTextDocument: () => disposable,
    },
  };
  const context = { subscriptions: [], extensionUri: uri('/extension'), workspaceState: { get: () => [], update: async () => {} } };
  registerExplorer(context, vscode);
  const children = await provider.getChildren();
  await provider.getChildren();
  assert.equal(searches, 1);
  const item = provider.getTreeItem(children[0]);
  await commands.get(item.command.command)(...item.command.arguments);
  assert.equal(executed[0][0], 'vscode.openWith');
  assert.equal(executed[0][1].path, '/docs/readme.md');
  assert.equal(executed[0][2], 'happyMarkdown.preview');
  assert.equal(executed[0][3].viewColumn, -1);
  commands.get('happyMarkdown.refreshExplorer')();
  await provider.getChildren();
  assert.equal(searches, 2);
  workspaceChanged();
  assert.equal(events, 2);
  await commands.get('happyMarkdown.openSource')(children[0]);
  assert.equal(executed[1][2], 'default');
  context.subscriptions.forEach(item => item.dispose());
});

test('search matches literal Japanese and case-insensitive text with CRLF line numbers', () => {
  assert.deepEqual(findMatches('見出し\r\n本文 ABC\r\na.c\r\nabc', 'AbC'), [{ line: 2, text: '本文 ABC' }, { line: 4, text: 'abc' }]);
  assert.deepEqual(findMatches('a.c\nabc', 'a.c'), [{ line: 1, text: 'a.c' }]);
  assert.deepEqual(findMatches('日本語の本文', '本文'), [{ line: 1, text: '日本語の本文' }]);
  assert.deepEqual(findMatches('本文', ''), []);
});

function explorerHarness(initial = [], followActive = true) {
  const commands = new Map(), state = new Map([['happyMarkdown.bookmarks', initial], ['happyMarkdown.followActive', followActive]]), warnings = [];
  const files = ['/docs/first.md', '/docs/second.markdown'].map(uri);
  const texts = new Map([[files[0].path, '検索対象\nHELLO unsaved'], [files[1].path, 'other\nhello again']]);
  let provider, searchProvider, receive, view, workspaceChanged, expand, collapse, tabsChanged, groupsChanged, visibilityChanged;
  const reveals = [], messages = [];
  let queryRevision = 0;
  const disposable = { dispose() {} };
  const vscode = {
    ...api,
    TabInputText: class { constructor(uri) { this.uri = uri; } },
    TabInputCustom: class { constructor(uri) { this.uri = uri; } },
    EventEmitter: class { event = () => disposable; fire() {} dispose() {} },
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    ViewColumn: { Active: -1 },
    window: {
      registerWebviewViewProvider: (id, value) => { searchProvider = value; return disposable; },
      tabGroups: { activeTabGroup: {}, onDidChangeTabs: fn => { tabsChanged = fn; return disposable; }, onDidChangeTabGroups: fn => { groupsChanged = fn; return disposable; } },
      createTreeView: (id, options) => { provider = options.treeDataProvider; return view = { ...disposable, visible: true, reveal: async (node, options) => { reveals.push({ node, options }); }, onDidChangeVisibility: fn => { visibilityChanged = fn; return disposable; }, onDidExpandElement: fn => { expand = fn; return disposable; }, onDidCollapseElement: fn => { collapse = fn; return disposable; } }; },

      showWarningMessage: value => { warnings.push(value); },
    },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async () => {} },
    workspace: {
      ...api.workspace, workspaceFolders: [folders[0]],
      findFiles: async () => files,
      asRelativePath: file => file.path.slice(1),
      openTextDocument: async file => { if (!texts.has(file.path)) throw new Error('unreadable'); return { getText: () => texts.get(file.path) }; },
      createFileSystemWatcher: () => ({ ...disposable, onDidCreate: () => disposable, onDidDelete: () => disposable, onDidChange: () => disposable }),
      onDidChangeWorkspaceFolders: fn => { workspaceChanged = fn; return disposable; },
      onDidChangeTextDocument: () => disposable,
    },
  };
  const context = { subscriptions: [], extensionUri: uri('/extension'), workspaceState: { get: (key, fallback) => state.get(key) ?? fallback, update: async (key, value) => { state.set(key, value); } } };
  registerExplorer(context, vscode);
  searchProvider.resolveWebviewView({ visible: true, onDidChangeVisibility: () => disposable, webview: { cspSource: 'test:', asWebviewUri: value => value.toString(), postMessage: message => { messages.push(message); return Promise.resolve(true); }, onDidReceiveMessage: fn => { receive = fn; return disposable; } } });
  return { commands, state, files, texts, warnings, vscode, context, reveals, messages, receive: message => receive(message),
    setQuery: value => receive({ type: 'query', value, requestId: ++queryRevision }),
    setActive: (input, group = false) => { vscode.window.tabGroups.activeTabGroup.activeTab = input ? { input } : undefined; return group ? groupsChanged() : tabsChanged(); },
    setVisible: visible => { view.visible = visible; visibilityChanged(); }, get provider() { return provider; }, get view() { return view; },
     expand: node => expand({ element: node }), collapse: node => collapse({ element: node }), workspaceChanged: () => workspaceChanged(), dispose: () => context.subscriptions.forEach(item => item.dispose()) };
}

test('switches between file tree, full text search and persistent bookmarks', async () => {
  const h = explorerHarness();
  try {
    const files = await h.provider.getChildren();
    assert.equal(files.length, 2);
    await h.setQuery('hello');
    await h.commands.get('happyMarkdown.showSearch')();
    const matches = await h.provider.getChildren();
    assert.equal(matches.length, 2);
    assert.equal(matches[0].matches[0].text, 'HELLO unsaved');
    assert.equal(h.view.description, '検索');
    await h.commands.get('happyMarkdown.addBookmark')(matches[1]);
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), ['file:///docs/second.markdown']);
    h.commands.get('happyMarkdown.showBookmarks')();
    const saved = await h.provider.getChildren();
    assert.equal(saved.length, 1);
    assert.equal(h.provider.getTreeItem(saved[0]).contextValue, 'bookmarkedMarkdownFile');
    h.commands.get('happyMarkdown.showFiles')();
    assert.equal((await h.provider.getChildren()).length, 2);
    await h.commands.get('happyMarkdown.showSearch')();
    await settleTree();
    assert.equal(h.messages.at(-1).query, 'hello');
    assert.equal(h.view.description, '検索');
    await h.commands.get('happyMarkdown.removeBookmark')(saved[0]);
    h.commands.get('happyMarkdown.showBookmarks')();
    assert.deepEqual(await h.provider.getChildren(), []);
  } finally { h.dispose(); }
});

test('restores bookmarks, hides missing files and serializes rapid bookmark changes', async () => {
  const h = explorerHarness(['file:///docs/first.md', 'file:///docs/missing.md']);
  try {
    h.commands.get('happyMarkdown.showBookmarks')();
    assert.equal((await h.provider.getChildren()).length, 1);
    await Promise.all([
      h.commands.get('happyMarkdown.addBookmark')({ uri: h.files[1] }),
      h.commands.get('happyMarkdown.removeBookmark')({ uri: h.files[0] }),
    ]);
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), ['file:///docs/missing.md', 'file:///docs/second.markdown']);
    assert.equal((await h.provider.getChildren())[0].uri, h.files[1]);
  } finally { h.dispose(); }
});

test('reports unreadable documents and rejects stale search results after switching modes', async () => {
  const h = explorerHarness();
  try {
    h.texts.delete(h.files[1].path);
    await h.setQuery('hello');
    await h.commands.get('happyMarkdown.showSearch')();
    assert.equal((await h.provider.getChildren()).length, 1);
    await settleTree();
    assert.match(h.messages.at(-1).status, /1ファイルを読み込めませんでした/);
    let release;
    h.vscode.workspace.openTextDocument = () => new Promise(resolve => { release = resolve; });
    h.commands.get('happyMarkdown.refreshExplorer')();
    const pending = h.provider.getChildren();
    await Promise.resolve();
    h.commands.get('happyMarkdown.showFiles')();
    release({ getText: () => 'hello' });
    assert.deepEqual(await pending, []);
    assert.equal((await h.provider.getChildren()).length, 2);
    assert.equal(h.view.description, 'ファイル一覧');
  } finally { h.dispose(); }
});

test('failed bookmark persistence keeps the previous bookmarks and allows retry', async () => {
  const h = explorerHarness(['file:///docs/first.md']);
  try {
    const update = h.context.workspaceState.update;
    h.context.workspaceState.update = async () => { throw new Error('storage failure'); };
    await h.commands.get('happyMarkdown.removeBookmark')({ uri: h.files[0] });
    h.commands.get('happyMarkdown.showBookmarks')();
    assert.equal((await h.provider.getChildren()).length, 1);
    assert.match(h.warnings[0], /保存できませんでした/);
    h.context.workspaceState.update = update;
    await h.commands.get('happyMarkdown.removeBookmark')({ uri: h.files[0] });
    assert.deepEqual(await h.provider.getChildren(), []);
  } finally { h.dispose(); }
});

test('shows folder state with explicit icons and retains expansion after refresh and mode switches', async () => {
  const h = explorerHarness();
  try {
    h.files.push(uri('/docs/nested/guide.md'));
    let folder = (await h.provider.getChildren()).find(node => node.children);
    let item = h.provider.getTreeItem(folder);
    assert.match(item.iconPath.light.path, /light\/folder.svg$/);
    assert.equal(item.collapsibleState, 1);
    assert.equal(item.description, '1項目');
    h.expand(folder);
    item = h.provider.getTreeItem(folder);
    assert.match(item.iconPath.dark.path, /dark\/folder-open.svg$/);
    assert.equal(item.collapsibleState, 2);
    h.commands.get('happyMarkdown.showBookmarks')();
    await h.provider.getChildren();
    h.commands.get('happyMarkdown.showFiles')();
    folder = (await h.provider.getChildren()).find(node => node.children);
    assert.equal(h.provider.getTreeItem(folder).collapsibleState, 2);
    h.collapse(folder);
    assert.equal(h.provider.getTreeItem(folder).collapsibleState, 1);
    assert.match(h.provider.getTreeItem(folder).iconPath.dark.path, /dark\/folder.svg$/);
  } finally { h.dispose(); }
});

test('uses distinct document and bookmarked document icons in both themes', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const h = explorerHarness();
  try {
    const node = (await h.provider.getChildren())[0];
    let item = h.provider.getTreeItem(node);
    assert.match(item.iconPath.dark.path, /document.svg$/);
    await h.commands.get('happyMarkdown.addBookmark')(node);
    item = h.provider.getTreeItem(node);
    assert.match(item.iconPath.light.path, /document-bookmarked.svg$/);
    assert.match(item.iconPath.dark.path, /document-bookmarked.svg$/);
    assert.equal(item.command.command, 'happyMarkdown.openDocument');
    for (const theme of ['light', 'dark']) for (const name of ['folder', 'folder-open', 'document', 'document-bookmarked']) {
      assert.ok(fs.existsSync(path.join(__dirname, '..', 'media', 'explorer', theme, `${name}.svg`)));
    }
  } finally { h.dispose(); }
});

const settleTree = () => new Promise(resolve => setImmediate(resolve));

test('tracks custom and source tabs, reveals nested documents without taking keyboard focus', async () => {
  const h = explorerHarness();
  try {
    const nested = uri('/docs/nested/deep/guide.md');
    h.files.push(nested);
    await h.setActive(new h.vscode.TabInputCustom(nested));
    const selected = h.reveals.at(-1);
    assert.equal(selected.node.uri, nested);
    assert.deepEqual(selected.options, { select: true, focus: false, expand: false });
    const parent = await h.provider.getParent(selected.node);
    assert.equal(parent.label, 'deep');
    assert.equal((await h.provider.getParent(parent)).label, 'nested');
    assert.equal(await h.provider.getParent(await h.provider.getParent(parent)), undefined);
    assert.equal(h.provider.getTreeItem(selected.node).description, '表示中');
    await h.setActive(new h.vscode.TabInputText(h.files[0]), true);
    assert.equal(h.reveals.at(-1).node.uri, h.files[0]);
    assert.equal(h.provider.getTreeItem(selected.node).description, undefined);
    await h.setActive(new h.vscode.TabInputText(uri('/docs/script.js')));
    assert.equal(h.provider.getTreeItem(h.reveals.at(-1).node).description, undefined);
  } finally { h.dispose(); }
});

test('keeps embedded search mode and marks only matching active documents', async () => {
  const h = explorerHarness();
  try {
    await h.setQuery('unsaved');
    await h.commands.get('happyMarkdown.showSearch')();
    await h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    await settleTree();
    assert.equal(h.messages.at(-1).results[0].active, true);
    await h.setActive(new h.vscode.TabInputCustom(h.files[1]));
    await settleTree();
    assert.equal(h.messages.at(-1).results[0].active, false);
    assert.equal(h.reveals.length, 0);
    assert.equal(h.view.description, '検索');
    await h.commands.get('happyMarkdown.addBookmark')({ uri: h.files[1] });
    h.commands.get('happyMarkdown.showBookmarks')();
    await settleTree();
    assert.equal(h.reveals.at(-1).node.uri, h.files[1]);
  } finally { h.dispose(); }
});

test('does not open hidden views, and restores active selection on visibility and refresh', async () => {
  const h = explorerHarness();
  try {
    h.setVisible(false);
    await h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    assert.equal(h.reveals.length, 0);
    h.setVisible(true);
    await settleTree();
    assert.equal(h.reveals.at(-1).node.uri, h.files[0]);
    const previous = h.reveals.at(-1).node;
    h.commands.get('happyMarkdown.refreshExplorer')();
    await settleTree();
    assert.equal(h.reveals.at(-1).node.uri, h.files[0]);
    assert.notEqual(h.reveals.at(-1).node, previous);
    const count = h.reveals.length;
    await h.setActive(new h.vscode.TabInputCustom(uri('/outside/not-in-workspace.md')));
    assert.equal(h.reveals.length, count);
  } finally { h.dispose(); }
});

test('ignores stale active tab requests while the tree is loading', async () => {
  const h = explorerHarness();
  try {
    let release;
    h.vscode.workspace.findFiles = () => new Promise(resolve => { release = resolve; });
    const first = h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    const second = h.setActive(new h.vscode.TabInputCustom(h.files[1]));
    release(h.files);
    await Promise.all([first, second]);
    assert.deepEqual(h.reveals.map(call => call.node.uri), [h.files[1]]);
    await h.setActive(undefined);
    assert.equal(h.provider.getTreeItem(h.reveals[0].node).description, undefined);
  } finally { h.dispose(); }
});

test('toggles following, saves the preference and resumes at the current document', async () => {
  const h = explorerHarness();
  try {
    await h.setActive(new h.vscode.TabInputCustom(h.files[0]));
    const count = h.reveals.length;
    await h.commands.get('happyMarkdown.disableFollowActive')();
    assert.equal(h.state.get('happyMarkdown.followActive'), false);
    assert.equal(h.provider.getTreeItem(h.reveals.at(-1).node).description, undefined);
    await h.setActive(new h.vscode.TabInputCustom(h.files[1]));
    h.commands.get('happyMarkdown.refreshExplorer')();
    await settleTree();
    assert.equal(h.reveals.length, count);
    await h.commands.get('happyMarkdown.enableFollowActive')();
    await settleTree();
    assert.equal(h.state.get('happyMarkdown.followActive'), true);
    assert.equal(h.reveals.at(-1).node.uri, h.files[1]);
    assert.equal(h.provider.getTreeItem(h.reveals.at(-1).node).description, '表示中');
  } finally { h.dispose(); }
});

test('restores disabled following and retains the previous preference if saving fails', async () => {
  const h = explorerHarness([], false);
  try {
    await h.setActive(new h.vscode.TabInputText(h.files[0]));
    assert.equal(h.reveals.length, 0);
    const nodes = await h.provider.getChildren();
    assert.equal(h.provider.getTreeItem(nodes[0]).description, undefined);
    h.context.workspaceState.update = async () => { throw new Error('storage failure'); };
    await h.commands.get('happyMarkdown.enableFollowActive')();
    assert.match(h.warnings[0], /追従設定を保存できませんでした/);
    assert.equal(h.state.get('happyMarkdown.followActive'), false);
    assert.equal(h.reveals.length, 0);
  } finally { h.dispose(); }
});

test('updates embedded results from input alone and ignores invalid messages and unknown file actions', async () => {
  const h = explorerHarness();
  try {
    await h.commands.get('happyMarkdown.showSearch')();
    await h.setQuery('hello');
    await new Promise(resolve => setTimeout(resolve, 130));
    const state = h.messages.at(-1);
    assert.equal(state.busy, false);
    assert.equal(state.results.length, 2);
    assert.equal(state.results[0].matches[0].text, 'HELLO unsaved');
    await h.receive({ type: 'query', value: 'other', requestId: -1 });
    await h.receive({ type: 'query', value: 'other', requestId: state.requestId });
    await h.receive({ type: 'query', value: {}, requestId: state.requestId + 1 });
    await h.receive({ type: 'bookmark', id: 'file:///outside/untrusted.md' });
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), []);
    await h.receive({ type: 'bookmark', id: state.results[0].id });
    await settleTree();
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [state.results[0].id]);
    assert.equal(h.messages.at(-1).query, 'hello');
    await h.setQuery('');
    assert.equal(h.messages.at(-1).results.length, 0);
  } finally { h.dispose(); }
});

test('slow earlier searches never overwrite newer input', async () => {
  const h = explorerHarness();
  try {
    let release;
    const open = h.vscode.workspace.openTextDocument;
    h.vscode.workspace.openTextDocument = async file => {
      if (!release) await new Promise(resolve => { release = resolve; });
      return open(file);
    };
    await h.setQuery('other');
    await h.commands.get('happyMarkdown.showSearch')();
    await settleTree();
    await h.setQuery('unsaved');
    release();
    await new Promise(resolve => setTimeout(resolve, 130));
    assert.equal(h.messages.at(-1).query, 'unsaved');
    assert.equal(h.messages.at(-1).results.length, 1);
    assert.equal(h.messages.at(-1).results[0].label, 'first.md');
  } finally { h.dispose(); }
});
