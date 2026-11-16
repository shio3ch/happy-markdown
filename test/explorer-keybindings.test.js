'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explorerHarness } = require('./explorer-harness');
const { waitFor } = require('./webview-helper');
const pkg = require('../package.json');
const keyboard = { fromKeybinding: true };
const file = 'file:///docs/first.md';

test('all file shortcuts are declared as native VS Code keybindings with OS defaults and focus conditions', () => {
  const bindings = pkg.contributes.keybindings;
  const expected = {
    rename: ['f2', 'enter'], delete: ['delete', 'cmd+backspace'], copy: ['ctrl+c', 'cmd+c'], cut: ['ctrl+x', 'cmd+x'], paste: ['ctrl+v', 'cmd+v'],
    openTab: ['enter', 'cmd+down'], openPreview: ['space', 'space'], openSide: ['ctrl+enter', 'ctrl+enter'],
    copyPath: ['ctrl+alt+c', 'cmd+alt+c'], copyRelativePath: ['ctrl+alt+shift+c', 'cmd+alt+shift+c'], cancelCut: ['escape', 'escape'], contextMenu: ['shift+f10', 'shift+f10'],
  };
  for (const [action, [key, mac]] of Object.entries(expected)) {
    const binding = bindings.find(item => item.command === `happyMarkdown.explorer.${action}`);
    assert.equal(binding.key, key); assert.equal(binding.mac || binding.key, mac);
    assert.match(binding.when, /happyMarkdown.explorerTreeFocus/); assert.match(binding.when, /!happyMarkdown.explorerBusy/);
    assert.deepEqual(binding.args, keyboard);
    assert.ok(pkg.contributes.commands.some(item => item.command === binding.command));
  }
  assert.equal(bindings.find(item => item.command.endsWith('.copyPath')).win, 'shift+alt+c');
  assert.equal(bindings.find(item => item.command.endsWith('.copyRelativePath')).win, 'ctrl+k ctrl+shift+c');
  assert.match(bindings.find(item => item.command.endsWith('.rename')).when, /!happyMarkdown.explorerRootSelected/);
  assert.match(bindings.find(item => item.command.endsWith('.copy')).when, /happyMarkdown.explorerFileSelected/);
  assert.match(bindings.find(item => item.command.endsWith('.paste')).when, /happyMarkdown.explorerCanPaste/);
  assert.match(bindings.find(item => item.command.endsWith('.cancelCut')).when, /happyMarkdown.explorerHasCut/);
  assert.match(bindings.find(item => item.command.endsWith('.toggleFolder')).when, /!isMac/);
});

test('VS Code registered commands share handlers with menus and publish selection and clipboard contexts', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await h.receive({ type: 'selection', id: file }); await h.receive({ type: 'treeFocus', focused: true });
    await waitFor(() => h.contextKeys.get('happyMarkdown.explorerFileSelected') && h.contextKeys.get('happyMarkdown.explorerTreeFocus'));
    await h.commands.get('happyMarkdown.explorer.copy')(keyboard); assert.equal(h.clipboard, '/docs/first.md');
    await waitFor(() => h.contextKeys.get('happyMarkdown.explorerCanPaste'));
    await h.commands.get('happyMarkdown.explorer.paste')(keyboard); assert.ok(h.texts.has('/docs/first のコピー.md'));
    await h.commands.get('happyMarkdown.explorer.cut')(keyboard); await waitFor(() => h.contextKeys.get('happyMarkdown.explorerHasCut'));
    await h.commands.get('happyMarkdown.explorer.cancelCut')(keyboard); await waitFor(() => h.contextKeys.get('happyMarkdown.explorerHasCut') === false);
    const count = h.edits.length;
    await h.receive({ type: 'treeFocus', focused: false });
    await h.commands.get('happyMarkdown.explorer.delete')(keyboard); assert.equal(h.edits.length, count); assert.equal(h.warnings.length, 0);
    h.setVisible(false); await waitFor(() => h.contextKeys.get('happyMarkdown.explorerTreeFocus') === false);
  } finally { h.dispose(); }
});

test('native key commands cannot queue repeated dialogs while a file operation is pending', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await h.receive({ type: 'selection', id: file }); await h.receive({ type: 'treeFocus', focused: true });
    let release, dialogs = 0;
    h.vscode.window.showInputBox = () => { dialogs++; return new Promise(resolve => { release = resolve; }); };
    const rename = h.commands.get('happyMarkdown.explorer.rename')(keyboard);
    await waitFor(() => release);
    await h.commands.get('happyMarkdown.explorer.rename')(keyboard); assert.equal(dialogs, 1);
    release(undefined); await rename;
    await waitFor(() => h.contextKeys.get('happyMarkdown.explorerBusy') === false);
    assert.equal(h.messages.at(-1).type, 'focusTree');
  } finally { h.dispose(); }
});

test('native context menu requests use host-to-Webview commands without a Webview key matcher', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await h.receive({ type: 'selection', id: file }); await h.receive({ type: 'treeFocus', focused: true });
    await h.commands.get('happyMarkdown.explorer.contextMenu')(keyboard);
    assert.deepEqual(h.messages.at(-1), { type: 'treeCommand', command: 'contextMenu' });
    const before = h.messages.length; await h.commands.get('happyMarkdown.explorer.toggleFolder')(keyboard); assert.equal(h.messages.length, before);
    h.setVisible(false); await h.commands.get('happyMarkdown.explorer.contextMenu')(keyboard); assert.equal(h.messages.length, before);
  } finally { h.dispose(); }
});

test('focus context updates do not wait for unrelated context command responses', async () => {
  const { explorerKeybindingContext } = require('../dist/extension/explorer-keybindings');
  const calls = []; let release;
  const context = explorerKeybindingContext({ commands: { executeCommand: (command, id, value) => {
    calls.push({ id, value });
    if (id.endsWith('HasSelection')) return new Promise(resolve => { release = resolve; });
    return Promise.resolve();
  } } });
  context.selection({ uri: {}, label: 'a.md' });
  await waitFor(() => release);
  context.focus(true); context.focus(false);
  assert.deepEqual(calls.filter(call => call.id.endsWith('TreeFocus')).map(call => call.value), [true, false]);
  release();
});

test('clipboard-only commands update keyboard state without rescanning the workspace', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await h.receive({ type: 'selection', id: file }); await h.receive({ type: 'treeFocus', focused: true });
    const searches = h.searches;
    for (const action of ['copy', 'cut', 'copyPath', 'copyRelativePath', 'cancelCut']) await h.commands.get(`happyMarkdown.explorer.${action}`)(keyboard);
    assert.equal(h.searches, searches);
    assert.equal(h.current.canPaste, false);
  } finally { h.dispose(); }
});
