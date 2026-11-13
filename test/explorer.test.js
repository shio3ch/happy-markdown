'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTree, registerExplorer } = require('../src/explorer');
const uri = path => ({ path, fsPath: path, toString: () => `file://${path}` });
const folders = [{ name: 'docs', uri: uri('/docs') }, { name: 'other', uri: uri('/other') }];
const api = {
  Uri: { joinPath: (base, name) => uri(`${base.path}/${name}`) },
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
    EventEmitter: class { event = () => disposable; fire() { events++; } dispose() {} },
    TreeItem: class { constructor(label, state) { this.label = label; this.collapsibleState = state; } },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    ThemeIcon: class { constructor(id) { this.id = id; } },
    ViewColumn: { Active: -1 },
    window: { registerTreeDataProvider: (id, value) => { provider = value; return disposable; } },
    commands: {
      registerCommand: (id, handler) => { commands.set(id, handler); return disposable; },
      executeCommand: (...args) => executed.push(args),
    },
    workspace: {
      ...api.workspace, workspaceFolders: [folders[0]],
      findFiles: async (include, exclude) => {
        assert.match(include, /markdown/);
        assert.match(exclude, /node_modules/);
        searches++;
        return [uri('/docs/readme.md')];
      },
      createFileSystemWatcher: () => ({ ...disposable, onDidCreate: () => disposable, onDidDelete: () => disposable }),
      onDidChangeWorkspaceFolders: handler => { workspaceChanged = handler; return disposable; },
    },
  };
  const context = { subscriptions: [] };
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
