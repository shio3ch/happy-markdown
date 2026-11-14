'use strict';
const assert = require('node:assert/strict');
const { registerExplorer } = require('../dist/src/explorer');
const uri = path => ({ path, fsPath: path, toString: () => `file://${path}` });
const folder = { name: 'docs', uri: uri('/docs') };

function explorerHarness(initial = [], followActive = true) {
  const commands = new Map(), state = new Map([['happyMarkdown.bookmarks', initial], ['happyMarkdown.followActive', followActive]]);
  const files = ['/docs/first.md', '/docs/second.markdown'].map(uri), texts = new Map([[files[0].path, '検索対象\nHELLO unsaved'], [files[1].path, 'other\nhello again']]);
  const warnings = [], messages = [], executed = [], callbacks = {}, disposable = { dispose() {} };
  let provider, receive, visibilityChanged, revision = 0, searches = 0;
  const vscode = {
    Uri: { joinPath: (base, ...parts) => uri(`${base.path}/${parts.join('/')}`) },
    TabInputText: class { constructor(uri) { this.uri = uri; } }, TabInputCustom: class { constructor(uri) { this.uri = uri; } }, ViewColumn: { Active: -1 },
    window: {
      registerWebviewViewProvider: (id, value) => { assert.equal(id, 'happyMarkdown.explorer'); provider = value; return disposable; },
      tabGroups: { activeTabGroup: {}, onDidChangeTabs: fn => { callbacks.tabs = fn; return disposable; }, onDidChangeTabGroups: fn => { callbacks.groups = fn; return disposable; } },
      showWarningMessage: value => { warnings.push(value); },
    },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async (...args) => { if (args[0] !== 'setContext') executed.push(args); } },
    workspace: {
      workspaceFolders: [folder], getWorkspaceFolder: file => file.path.startsWith('/docs/') ? folder : undefined,
      findFiles: async (include, exclude) => { searches++; assert.match(include, /markdown/); assert.match(exclude, /node_modules/); return files; },
      asRelativePath: file => file.path.slice(1),
      openTextDocument: async file => { if (!texts.has(file.path)) throw new Error('unreadable'); return { getText: () => texts.get(file.path) }; },
      createFileSystemWatcher: () => ({ ...disposable, onDidCreate: () => disposable, onDidDelete: () => disposable, onDidChange: fn => { callbacks.file = fn; return disposable; } }),
      onDidChangeWorkspaceFolders: fn => { callbacks.workspace = fn; return disposable; }, onDidChangeTextDocument: fn => { callbacks.text = fn; return disposable; },
    },
  };
  const context = { subscriptions: [], extensionUri: uri('/extension'), workspaceState: { get: (key, fallback) => state.get(key) ?? fallback, update: async (key, value) => { state.set(key, value); } } };
  registerExplorer(context, vscode);
  const view = { visible: true, onDidChangeVisibility: fn => { visibilityChanged = fn; return disposable; }, webview: {
    cspSource: 'test:', asWebviewUri: value => value, postMessage: message => { messages.push(message); return Promise.resolve(true); }, onDidReceiveMessage: fn => { receive = fn; return disposable; },
  } };
  provider.resolveWebviewView(view);
  return { commands, state, files, texts, warnings, vscode, context, view, messages, executed, callbacks, get searches() { return searches; },
    get current() { return messages.at(-1); }, receive: message => receive(message), ready: () => receive({ type: 'ready' }),
    setQuery: value => receive({ type: 'query', value, requestId: ++revision }), mode: mode => receive({ type: 'mode', mode }),
    setActive: (input, group = false) => { vscode.window.tabGroups.activeTabGroup.activeTab = input ? { input } : undefined; return callbacks[group ? 'groups' : 'tabs'](); },
    setVisible: visible => { view.visible = visible; visibilityChanged(); }, dispose: () => context.subscriptions.forEach(item => item.dispose()) };
}
module.exports = { explorerHarness, uri };
