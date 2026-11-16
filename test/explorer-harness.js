'use strict';
const assert = require('node:assert/strict');
const { registerExplorer } = require('../dist/extension/explorer');
const pathApi = require('node:path').posix;
const uri = value => { const path = pathApi.normalize(value); return { scheme: 'file', authority: '', path, fsPath: path, toString: () => `file://${path}` }; };
const folder = { name: 'docs', uri: uri('/docs') };

function explorerHarness(initial = [], followActive = true) {
  const contextKeys = new Map(), commands = new Map(), state = new Map([['happyMarkdown.bookmarks', initial], ['happyMarkdown.followActive', followActive]]);
  const files = ['/docs/first.md', '/docs/second.markdown'].map(uri), texts = new Map([[files[0].path, '検索対象\nHELLO unsaved'], [files[1].path, 'other\nhello again']]);
  const directories = new Set(['/docs']), inputs = [], answers = [], edits = [], documents = [], links = new Set();
  let clipboard = '';
  const allDirectories = () => { const result = new Set(directories); for (const file of files) { let parent = pathApi.dirname(file.path); while (parent !== '/') { result.add(parent); parent = pathApi.dirname(parent); } } return result; };
  const missing = () => Object.assign(new Error('missing'), { code: 'FileNotFound' });
  const warnings = [], messages = [], executed = [], callbacks = {}, disposable = { dispose() {} };
  let provider, receive, visibilityChanged, revision = 0, searches = 0;
  const vscode = {
    FileType: { File: 1, Directory: 2, SymbolicLink: 64 },
    env: { clipboard: { writeText: async value => { clipboard = value; }, readText: async () => clipboard } },
    WorkspaceEdit: class {
      entries = [];
      createFile(uri, options) { this.entries.push({ type: 'create', uri, options }); }
      renameFile(uri, target, options) { this.entries.push({ type: 'rename', uri, target, options }); }
      deleteFile(uri, options) { this.entries.push({ type: 'delete', uri, options }); }
    },
    Uri: { joinPath: (base, ...parts) => uri(`${base.path}/${parts.join('/')}`) },
    TabInputText: class { constructor(uri) { this.uri = uri; } }, TabInputCustom: class { constructor(uri) { this.uri = uri; } }, ViewColumn: { Active: -1, Beside: -2 },
    window: {
      registerWebviewViewProvider: (id, value) => { assert.equal(id, 'happyMarkdown.explorer'); provider = value; return disposable; },
      tabGroups: { activeTabGroup: {}, onDidChangeTabs: fn => { callbacks.tabs = fn; return disposable; }, onDidChangeTabGroups: fn => { callbacks.groups = fn; return disposable; } },
      showInputBox: async options => { const value = inputs.shift(); if (value !== undefined) { const error = options.validateInput(value); if (error) throw new Error(error); } return value; },
      showQuickPick: async values => values[0],
      showWarningMessage: (value, options) => { warnings.push(value); return options?.modal ? answers.shift() : undefined; },
    },
    commands: { registerCommand: (id, fn) => { commands.set(id, fn); return disposable; }, executeCommand: async (...args) => { if (args[0] === 'setContext') contextKeys.set(args[1], args[2]); else executed.push(args); } },
    workspace: {
      textDocuments: documents,
      fs: {
        stat: async file => { if (links.has(file.path)) return { type: 66 }; if (allDirectories().has(file.path)) return { type: 2 }; if (files.some(item => item.path === file.path)) return { type: 1 }; throw missing(); },
        readDirectory: async parent => {
          const entries = new Map();
          for (const path of allDirectories()) if (pathApi.dirname(path) === parent.path && path !== parent.path) entries.set(pathApi.basename(path), 2);
          for (const file of files) if (pathApi.dirname(file.path) === parent.path) entries.set(pathApi.basename(file.path), 1);
          for (const link of links) if (pathApi.dirname(link) === parent.path) entries.set(pathApi.basename(link), 66);
          return [...entries];
        },
        createDirectory: async file => { if (allDirectories().has(file.path)) throw new Error('exists'); directories.add(file.path); },
        readFile: async file => { if (!texts.has(file.path)) throw missing(); return Buffer.from(texts.get(file.path)); },
      },
      applyEdit: async edit => {
        for (const entry of edit.entries) {
          if (entry.type === 'create') {
            if (files.some(file => file.path === entry.uri.path) || allDirectories().has(entry.uri.path)) throw new Error('exists');
            files.push(entry.uri); texts.set(entry.uri.path, Buffer.from(entry.options.contents || []).toString());
          }
          if (entry.type === 'rename') {
            if (files.some(file => file.path === entry.target.path) || allDirectories().has(entry.target.path)) throw new Error('exists');
            const remap = path => path === entry.uri.path || path.startsWith(entry.uri.path + '/') ? entry.target.path + path.slice(entry.uri.path.length) : path;
            for (let i = 0; i < files.length; i++) { const old = files[i].path, next = remap(old); if (old !== next) { files[i] = uri(next); if (texts.has(old)) { texts.set(next, texts.get(old)); texts.delete(old); } } }
            for (const dir of [...directories]) { const next = remap(dir); if (dir !== next) { directories.delete(dir); directories.add(next); } }
            for (const document of documents) document.uri = uri(remap(document.uri.path));
          }
          if (entry.type === 'delete') {
            for (let i = files.length - 1; i >= 0; i--) if (files[i].path === entry.uri.path || files[i].path.startsWith(entry.uri.path + '/')) { texts.delete(files[i].path); files.splice(i, 1); }
            for (const dir of [...directories]) if (dir === entry.uri.path || dir.startsWith(entry.uri.path + '/')) directories.delete(dir);
          }
        }
        edits.push(edit); return true;
      },
      workspaceFolders: [folder], getWorkspaceFolder: file => file.path === '/docs' || file.path.startsWith('/docs/') ? folder : undefined,
      findFiles: async (include, exclude) => { searches++; assert.match(include, /markdown/); assert.match(exclude, /node_modules/); return files; },
      asRelativePath: file => file.path.slice(1),
      openTextDocument: async file => { if (!texts.has(file.path)) throw new Error('unreadable'); return { getText: () => texts.get(file.path) }; },
      createFileSystemWatcher: () => ({ ...disposable, onDidCreate: () => disposable, onDidDelete: () => disposable, onDidChange: fn => { callbacks.file = fn; return disposable; } }),
      onDidRenameFiles: fn => { callbacks.rename = fn; return disposable; },
      onDidChangeWorkspaceFolders: fn => { callbacks.workspace = fn; return disposable; }, onDidChangeTextDocument: fn => { callbacks.text = fn; return disposable; },
    },
  };
  const context = { subscriptions: [], extensionUri: uri('/extension'), workspaceState: { get: (key, fallback) => state.get(key) ?? fallback, update: async (key, value) => { state.set(key, value); } } };
  registerExplorer(context, vscode);
  const view = { visible: true, onDidChangeVisibility: fn => { visibilityChanged = fn; return disposable; }, webview: {
    cspSource: 'test:', asWebviewUri: value => value, postMessage: message => { messages.push(message); return Promise.resolve(true); }, onDidReceiveMessage: fn => { receive = fn; return disposable; },
  } };
  provider.resolveWebviewView(view);
  return { commands, contextKeys, state, files, texts, warnings, directories, inputs, answers, edits, documents, links, get clipboard() { return clipboard; }, set clipboard(value) { clipboard = value; }, vscode, context, view, messages, executed, callbacks, get searches() { return searches; },
    get current() { return messages.findLast(message => message.type === 'state'); }, receive: message => receive(message), ready: () => receive({ type: 'ready' }),
    setQuery: value => receive({ type: 'query', value, requestId: ++revision }), mode: mode => receive({ type: 'mode', mode }),
    setActive: (input, group = false) => { vscode.window.tabGroups.activeTabGroup.activeTab = input ? { input } : undefined; return callbacks[group ? 'groups' : 'tabs'](); },
    setVisible: visible => { view.visible = visible; visibilityChanged(); }, dispose: () => context.subscriptions.forEach(item => item.dispose()) };
}
module.exports = { explorerHarness, uri };
