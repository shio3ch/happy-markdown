'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explorerShell } = require('../dist/extension/explorer-view');
const { webview, waitFor } = require('./webview-helper');
const entry = (id, label, extra = {}) => ({ id, label, path: `/docs/${label}`, bookmarked: false, active: false,
  icon: { light: 'https://webview.test/light/document.svg', dark: 'https://webview.test/dark/document.svg' }, ...extra });
const files = () => [entry('folder', '入門', { children: [entry('guide', '手順.md')] }), entry('readme', 'README.md')];
async function client(initial = {}) {
  const c = await webview('explorer', explorerShell({ cspSource: 'https://webview.test' }, path => path));
  const receive = state => c.receive({ type: 'state', mode: 'files', nodes: files(), expandedIds: [], followActive: true, hasWorkspace: true,
    revealRevision: 0, busy: false, query: '', requestId: 0, status: '', results: [], ...state });
  await receive(initial); return { ...c, receive };
}
const treeCommand = async (c, command) => { c.window.dispatchEvent(new c.window.MessageEvent('message', { data: { type: 'treeCommand', command } })); await new Promise(resolve => setTimeout(resolve, 5)); };
const key = (c, target, name, extra = {}) => target.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra }));

test('React file tree supports roving focus, arrows, folder expansion and opening files', async () => {
  const c = await client();
  try {
    const folder = c.document.querySelector('[data-entry="folder"]');
    assert.equal(c.document.querySelectorAll('[role="treeitem"]').length, 2);
    folder.focus(); key(c, folder, 'ArrowRight');
    assert.equal(c.sent.at(-1).type, 'expand'); assert.equal(c.sent.at(-1).expanded, true);
    await c.receive({ expandedIds: ['folder'] });
    assert.equal(folder.getAttribute('aria-expanded'), 'true');
    key(c, folder, 'ArrowRight');
    await waitFor(() => c.document.activeElement.dataset.entry === 'guide');
    key(c, c.document.activeElement, 'ArrowLeft');
    assert.equal(c.document.activeElement, folder);
    key(c, folder, 'R', { shiftKey: true });
    assert.equal(c.document.activeElement.dataset.entry, 'readme');
    key(c, c.document.activeElement, 'Home');
    key(c, folder, 'End');
    assert.equal(c.document.activeElement.dataset.entry, 'readme');
    c.document.activeElement.querySelector('.file-row').click();
    assert.equal(c.sent.at(-1).type, 'openPreview'); assert.equal(c.sent.at(-1).id, 'readme');
    key(c, c.document.activeElement, 'Home');
    assert.equal(c.document.activeElement, folder);
    key(c, folder, 'ArrowLeft');
    assert.equal(c.sent.at(-1).expanded, false);
    await c.receive({});
    assert.equal(c.document.querySelectorAll('[role="treeitem"][tabindex="0"]').length, 1);
  } finally { await c.dispose(); }
});

test('React file actions and keyboard context menu keep focus through bookmark updates', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]');
    file.focus(); await treeCommand(c, 'contextMenu');
    await waitFor(() => c.document.querySelector('[role="menu"]'));
    assert.equal(c.document.activeElement.getAttribute('role'), 'menuitem');
    key(c, c.document.activeElement, 'Escape');
    await waitFor(() => !c.document.querySelector('[role="menu"]'));
    assert.equal(c.document.activeElement, file);
    const button = file.querySelector('[aria-pressed]');
    button.focus(); button.click();
    assert.equal(c.sent.at(-1).type, 'bookmark');
    assert.equal(c.sent.at(-1).id, 'readme');
    const nodes = files(); nodes[1].bookmarked = true;
    await c.receive({ nodes });
    assert.equal(c.document.activeElement, button);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    file.querySelector('.file-row').dispatchEvent(new c.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await waitFor(() => c.document.querySelector('[role="menu"]'));
    c.document.querySelector('[role="menu"] button').click();
    assert.equal(c.sent.at(-1).type, 'open'); assert.equal(c.sent.at(-1).id, 'readme');
  } finally { await c.dispose(); }
});

test('React tree reveals active descendants without taking keyboard focus and renders filenames as text', async () => {
  const c = await client();
  try {
    const nav = c.document.querySelector('[aria-label="ファイル一覧"]'); nav.focus();
    const nodes = files(); nodes[0].children[0].active = true; nodes[1].label = '<img onerror=alert(1)>';
    await c.receive({ nodes, expandedIds: ['folder'], revealId: 'guide', revealRevision: 1 });
    assert.equal(c.document.activeElement, nav);
    const guide = c.document.querySelector('[data-entry="guide"]');
    assert.equal(guide.getAttribute('aria-selected'), 'true');
    assert.match(guide.textContent, /表示中/);
    assert.match(c.document.body.textContent, /<img onerror=alert\(1\)>/);
    assert.equal(c.document.querySelector('img[onerror]'), null);
  } finally { await c.dispose(); }
});

test('navigation composes file, bookmark and search views and keeps the query after switching modes', async () => {
  const c = await client({ query: '保持した検索語' });
  try {
    c.document.querySelector('[aria-label="ブックマーク"]').click();
    assert.equal(c.sent.at(-1).type, 'mode'); assert.equal(c.sent.at(-1).mode, 'bookmarks');
    await c.receive({ mode: 'bookmarks', nodes: [entry('readme', 'README.md', { bookmarked: true })], query: '保持した検索語' });
    assert.ok(c.document.querySelector('[aria-label="保存したブックマーク"]'));
    c.document.querySelector('[aria-label="本文検索"]').click();
    assert.equal(c.sent.at(-1).mode, 'search');
    await c.receive({ mode: 'search', nodes: [], query: '保持した検索語' });
    assert.equal(c.document.getElementById('query').value, '保持した検索語');
    c.document.querySelector('[aria-label="現在の文書への追従"]').click();
    assert.equal(c.sent.at(-1).type, 'follow'); assert.equal(c.sent.at(-1).enabled, false);
    c.document.querySelector('[aria-label="一覧を更新"]').click(); assert.equal(c.sent.at(-1).type, 'refresh');
    await c.receive({ hasWorkspace: false, nodes: [], query: '保持した検索語' });
    const button = [...c.document.querySelectorAll('button')].find(button => button.textContent === 'フォルダーを開く');
    button.click(); assert.equal(c.sent.at(-1).type, 'openFolder');
  } finally { await c.dispose(); }
});

test('React sidebar and host integrate folder expansion, bookmarking and live search', async () => {
  const { explorerHarness, uri } = require('./explorer-harness');
  const h = explorerHarness();
  h.files.push(uri('/docs/nested/guide.md')); h.texts.set('/docs/nested/guide.md', 'guide');
  const c = await webview('explorer', h.view.webview.html);
  let sent = 0, received = 0;
  const pump = async () => {
    while (sent < c.sent.length) await h.receive(c.sent[sent++]);
    while (received < h.messages.length) await c.receive(h.messages[received++]);
  };
  try {
    await pump();
    const folder = c.document.querySelector('[data-entry="file:///docs/nested"]');
    folder.querySelector('.file-row').click(); await pump();
    assert.equal(folder.getAttribute('aria-expanded'), 'true');
    assert.ok(c.document.querySelector('[data-entry="file:///docs/nested/guide.md"]'));
    c.document.querySelector('[data-entry="file:///docs/first.md"] [aria-pressed]').click(); await pump();
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), ['file:///docs/first.md']);
    c.document.querySelector('[aria-label="ブックマーク"]').click(); await pump();
    assert.equal(c.document.querySelectorAll('[role="treeitem"]').length, 1);
    c.document.querySelector('[aria-label="本文検索"]').click(); await pump();
    await c.input(c.document.getElementById('query'), 'hello'); await pump();
    await waitFor(() => !h.current.busy); await pump();
    assert.equal(c.document.querySelectorAll('.result').length, 2);
    assert.match(c.document.querySelector('.result').textContent, /HELLO unsaved/);
  } finally { h.dispose(); await c.dispose(); }
});

test('file creation toolbar and context menu keep operations and mark shortcut labels as defaults', async () => {
  const c = await client({ canPaste: true });
  try {
    c.document.querySelector('[aria-label="ファイルの新規作成"]').click();
    assert.equal(c.sent.at(-1).action, 'newFile'); assert.equal(c.sent.at(-1).id, undefined);
    const folder = c.document.querySelector('[data-entry="folder"]'); folder.focus();
    await waitFor(() => folder.getAttribute('aria-selected') === 'true');
    c.document.querySelector('[aria-label="フォルダーの新規作成"]').click();
    assert.equal(c.sent.at(-1).action, 'newFolder'); assert.equal(c.sent.at(-1).id, 'folder');
    const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
    file.querySelector('.file-row').dispatchEvent(new c.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 80 }));
    await waitFor(() => c.document.querySelector('[role="menu"]'));
    const menu = c.document.querySelector('[role="menu"]');
    assert.deepEqual([...menu.querySelectorAll('button')].map(button => button.querySelector('.menu-label').textContent), ['ファイルを開く', '新規タブでファイルを開く', '横に開く', '複製の作成', 'コピー', '切り取り', '貼り付け', 'パスのコピー', '相対パスのコピー', '名前の変更', '削除', 'ソースを開く', 'ブックマークに追加']);
    key(c, c.document.activeElement, 'End'); assert.equal(c.document.activeElement.textContent, 'ブックマークに追加');
    key(c, c.document.activeElement, 'Home'); key(c, c.document.activeElement, 'ArrowDown');
    assert.equal(c.document.activeElement.querySelector('.menu-label').textContent, '新規タブでファイルを開く'); c.document.activeElement.click();
    assert.equal(c.sent.at(-1).type, 'openTab'); assert.equal(c.sent.at(-1).id, 'readme');
    await waitFor(() => !c.document.querySelector('[role="menu"]'));
    assert.equal(c.document.activeElement, file);
    await c.receive({ canPaste: true, cutId: 'readme' });
    assert.ok(file.querySelector('.file-row.cut'));
  } finally { await c.dispose(); }
});

test('folder and empty-space menus create items, disabled paste is skipped and stale selections fall back to the root', async () => {
  const c = await client();
  try {
    const folder = c.document.querySelector('[data-entry="folder"]'); folder.focus();
    await treeCommand(c, 'contextMenu');
    await waitFor(() => c.document.querySelector('[role="menu"]'));
    assert.equal(c.document.activeElement.textContent, 'ファイルの新規作成');
    assert.equal([...c.document.querySelectorAll('[role="menu"] button')].find(button => button.querySelector('.menu-label').textContent === '貼り付け').disabled, true);
    key(c, c.document.activeElement, 'ArrowDown'); key(c, c.document.activeElement, 'ArrowDown');
    assert.equal(c.document.activeElement.querySelector('.menu-label').textContent, 'パスのコピー');
    key(c, c.document.activeElement, 'Escape');
    await waitFor(() => !c.document.querySelector('[role="menu"]'));
    const tree = c.document.querySelector('[role="tree"]');
    tree.dispatchEvent(new c.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    await waitFor(() => c.document.querySelector('[role="menu"]'));
    c.document.activeElement.click();
    assert.equal(c.sent.at(-1).action, 'newFile'); assert.equal(c.sent.at(-1).id, undefined);
    await c.receive({ nodes: [] });
    c.document.querySelector('[aria-label="フォルダーの新規作成"]').click();
    assert.equal(c.sent.at(-1).id, undefined);
  } finally { await c.dispose(); }
});

test('drag and drop only moves internal files to folders or the workspace background', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"] > .file-row'), folder = c.document.querySelector('[data-entry="folder"] > .file-row');
    const data = new Map(), transfer = { setData: (type, value) => data.set(type, value), getData: type => data.get(type) };
    const drag = (target, type) => { const event = new c.window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'dataTransfer', { value: transfer }); target.dispatchEvent(event); return event; };
    const before = c.sent.length;
    drag(folder, 'drop'); assert.equal(c.sent.length, before); // External drops are ignored.
    assert.equal(folder.draggable, false); assert.equal(file.draggable, true);
    drag(file, 'dragstart'); assert.equal(drag(folder, 'dragover').defaultPrevented, true);
    await waitFor(() => folder.classList.contains('drop-target'));
    drag(folder, 'drop'); assert.equal(c.sent.at(-1).type, 'move'); assert.equal(c.sent.at(-1).id, 'readme'); assert.equal(c.sent.at(-1).targetId, 'folder');
    drag(file, 'dragstart'); drag(c.document.querySelector('[role="tree"]'), 'drop'); assert.equal(c.sent.at(-1).targetId, undefined);
    const count = c.sent.length;
    drag(file, 'dragstart'); assert.equal(drag(file, 'dragover').defaultPrevented, false); drag(file, 'drop'); assert.equal(c.sent.length, count);
    drag(file, 'dragstart'); drag(file, 'dragend'); drag(folder, 'drop'); assert.equal(c.sent.length, count);
  } finally { await c.dispose(); }
});

test('explorer icon tooltips open on focus, describe the next action, and dismiss on Escape or click', async () => {
  const c = await client();
  try {
    const nav = c.document.querySelector('[aria-label="ファイル一覧"]');
    assert.equal(c.document.querySelector('[role="tooltip"]'), null);
    nav.focus();
    await waitFor(() => c.document.querySelector('[role="tooltip"]'));
    assert.equal(c.document.querySelector('[role="tooltip"]').textContent, 'ファイル一覧を表示');
    assert.equal(nav.getAttribute('aria-describedby'), c.document.querySelector('[role="tooltip"]').id);
    key(c, nav, 'Escape');
    await waitFor(() => !c.document.querySelector('[role="tooltip"]'));
    assert.equal(c.document.activeElement, nav);
    const follow = c.document.querySelector('[aria-label="現在の文書への追従"]');
    follow.focus();
    await waitFor(() => c.document.querySelector('[role="tooltip"]'));
    assert.match(c.document.querySelector('[role="tooltip"]').textContent, /オフにする/);
    await c.receive({ followActive: false });
    assert.match(c.document.querySelector('[role="tooltip"]').textContent, /オンにする/);
    follow.click();
    await waitFor(() => !c.document.querySelector('[role="tooltip"]'));
    assert.equal(c.sent.at(-1).type, 'follow');
    const source = c.document.querySelector('[aria-label="README.mdのソースを開く"]');
    source.focus();
    await waitFor(() => c.document.querySelector('[role="tooltip"]'));
    assert.match(c.document.querySelector('[role="tooltip"]').textContent, /標準エディター/);
    const bookmark = c.document.querySelector('[aria-label="README.mdをブックマークに追加"]');
    bookmark.focus();
    await waitFor(() => c.document.querySelector('[role="tooltip"]')?.textContent === 'ブックマークに追加');
    const nodes = files(); nodes[1].bookmarked = true;
    await c.receive({ nodes });
    assert.equal(c.document.querySelector('[role="tooltip"]').textContent, 'ブックマーク解除');
  } finally { await c.dispose(); }
});

test('hover tooltips explain disabled paste, cancel pending displays, and stay inside viewport edges', async () => {
  const c = await client();
  try {
    const paste = c.document.querySelector('[aria-label="貼り付け"]');
    assert.equal(paste.disabled, true);
    const trigger = paste.closest('.tooltip-trigger');
    trigger.getBoundingClientRect = () => ({ left: 1020, right: 1048, top: 740, bottom: 768, width: 28, height: 28 });
    const original = c.window.HTMLElement.prototype.getBoundingClientRect;
    c.window.HTMLElement.prototype.getBoundingClientRect = function () { return this.getAttribute('role') === 'tooltip' ? { width: 240, height: 48 } : original.call(this); };
    const pointer = type => trigger.dispatchEvent(new c.window.MouseEvent(type, { bubbles: true }));
    pointer('pointerover');
    assert.equal(c.document.querySelector('[role="tooltip"]'), null);
    pointer('pointerout');
    await new Promise(resolve => setTimeout(resolve, 380));
    assert.equal(c.document.querySelector('[role="tooltip"]'), null);
    pointer('pointerover');
    await waitFor(() => c.document.querySelector('[role="tooltip"]'));
    const tooltip = c.document.querySelector('[role="tooltip"]');
    assert.match(tooltip.textContent, /先にコピー・切り取り/);
    assert.equal(tooltip.style.left, '780px'); assert.equal(tooltip.style.top, '686px');
    assert.equal(c.sent.filter(message => message.type === 'fileOperation').length, 0);
    pointer('pointerout');
    await waitFor(() => !c.document.querySelector('[role="tooltip"]'));
    pointer('pointerover'); await waitFor(() => c.document.querySelector('[role="tooltip"]'));
    c.window.dispatchEvent(new c.window.Event('resize'));
    await waitFor(() => !c.document.querySelector('[role="tooltip"]'));
  } finally { await c.dispose(); }
});

test('command shortcuts reach the VS Code keybinding resolver without executing a Webview action', async () => {
  for (const platform of ['mac', 'windows', 'linux']) {
    const c = await client({ platform, canPaste: true });
    try {
      const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
      const forwarded = []; c.window.addEventListener('keydown', event => forwarded.push(event));
      const before = c.sent.filter(message => ['fileOperation', 'cancelCut', 'openTab', 'openSide', 'openPreview'].includes(message.type)).length;
      for (const [name, extra] of [['Enter', {}], ['F2', {}], ['Delete', {}], ['Backspace', { metaKey: true }], ['ArrowDown', { metaKey: true }],
        ['c', { ctrlKey: true }], ['x', { metaKey: true }], ['v', { ctrlKey: true }], ['Enter', { ctrlKey: true }], [' ', {}],
        ['c', { ctrlKey: true, altKey: true }], ['k', { ctrlKey: true }], ['c', { ctrlKey: true, shiftKey: true }], ['F9', {}], ['Escape', {}], ['F10', { shiftKey: true }]]) {
        const count = forwarded.length;
        const event = new c.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...extra }); file.dispatchEvent(event);
        assert.equal(event.defaultPrevented, false, name); assert.equal(forwarded.length, count + 1, name);
      }
      assert.equal(c.sent.filter(message => ['fileOperation', 'cancelCut', 'openTab', 'openSide', 'openPreview'].includes(message.type)).length, before);
    } finally { await c.dispose(); }
  }
});

test('IME and repeated command keys stay in the tree while search input and buttons retain normal input behavior', async () => {
  const c = await client({ platform: 'mac', canPaste: true });
  try {
    const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
    const forwarded = []; c.window.addEventListener('keydown', event => forwarded.push(event));
    for (const [name, extra] of [['Enter', { isComposing: true }], ['Backspace', { metaKey: true, isComposing: true }], ['F9', { repeat: true }], ['v', { metaKey: true, repeat: true }]]) key(c, file, name, extra);
    assert.equal(forwarded.length, 0);
    const button = file.querySelector('button'); button.focus();
    assert.equal(c.sent.at(-1).type, 'treeFocus'); assert.equal(c.sent.at(-1).focused, false);
    key(c, button, 'Enter'); assert.equal(forwarded.length, 1);
    await c.receive({ mode: 'search', nodes: [] }); const input = c.document.getElementById('query'); input.focus();
    for (const [name, extra] of [['Enter', {}], ['Backspace', { metaKey: true }], ['v', { metaKey: true }], ['c', { metaKey: true }]]) key(c, input, name, extra);
    assert.equal(forwarded.length, 5);
    assert.equal(c.sent.filter(message => message.type === 'fileOperation').length, 0);
  } finally { await c.dispose(); }
});

test('native context-menu and folder-toggle commands act on the focused row and ignore action buttons', async () => {
  const c = await client();
  try {
    const folder = c.document.querySelector('[data-entry="folder"]'); folder.focus();
    await treeCommand(c, 'toggleFolder'); assert.equal(c.sent.findLast(message => message.type === 'expand').expanded, true);
    const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
    await treeCommand(c, 'contextMenu'); await waitFor(() => c.document.querySelector('[role="menu"]'));
    assert.match(c.document.querySelector('[role="menu"] kbd').textContent, /既定/);
    key(c, c.document.activeElement, 'Escape'); await waitFor(() => !c.document.querySelector('[role="menu"]'));
    file.querySelector('button').focus(); const count = c.sent.filter(message => message.type === 'expand').length;
    await treeCommand(c, 'contextMenu'); assert.equal(c.document.querySelector('[role="menu"]'), null);
    await treeCommand(c, 'toggleFolder'); assert.equal(c.sent.filter(message => message.type === 'expand').length, count);
    await c.receive({ nodes: [] }); const tree = c.document.querySelector('[role="tree"]'); tree.focus();
    await treeCommand(c, 'contextMenu'); await waitFor(() => c.document.querySelector('[role="menu"]'));
    key(c, c.document.activeElement, 'Escape'); await waitFor(() => !c.document.querySelector('[role="menu"]')); assert.equal(c.document.activeElement, tree);
  } finally { await c.dispose(); }
});

test('rename and delete focus replies restore a surviving tree row without stealing focus on ordinary state updates', async () => {
  const c = await client();
  try {
    const nav = c.document.querySelector('[aria-label="ファイル一覧"]'); nav.focus();
    await c.receive({ nodes: [entry('renamed', 'renamed.md')] });
    assert.equal(c.document.activeElement, nav);
    c.window.dispatchEvent(new c.window.MessageEvent('message', { data: { type: 'focusTree', id: 'renamed' } }));
    await waitFor(() => c.document.activeElement.dataset.entry === 'renamed');
    await c.receive({ nodes: [] });
    c.window.dispatchEvent(new c.window.MessageEvent('message', { data: { type: 'focusTree', id: 'deleted' } }));
    await waitFor(() => c.document.activeElement.getAttribute('role') === 'tree');
  } finally { await c.dispose(); }
});

test('single-click previews keep the tree focus and double-clicks explicitly open a pinned tab', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]'), row = file.querySelector('.file-row');
    row.dispatchEvent(new c.window.MouseEvent('click', { bubbles: true, detail: 1 }));
    assert.equal(c.sent.at(-1).type, 'openPreview'); assert.equal(c.document.activeElement, file);
    const before = c.sent.filter(message => ['openPreview', 'openTab'].includes(message.type)).length;
    row.dispatchEvent(new c.window.MouseEvent('click', { bubbles: true, detail: 2 }));
    row.dispatchEvent(new c.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    assert.equal(c.sent.at(-1).type, 'openTab');
    assert.equal(c.sent.filter(message => ['openPreview', 'openTab'].includes(message.type)).length, before + 1);
  } finally { await c.dispose(); }
});

test('a newly focused row publishes its selection before enabling file shortcuts in the same event', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]');
    c.document.querySelector('[data-entry="folder"]').focus(); const before = c.sent.length;
    file.focus();
    const messages = c.sent.slice(before), selection = messages.findIndex(message => message.type === 'selection' && message.id === 'readme');
    const enabled = messages.findIndex(message => message.type === 'treeFocus' && message.focused);
    assert.ok(selection >= 0); assert.ok(enabled > selection);
  } finally { await c.dispose(); }
});

test('window blur disables tree shortcuts and returning focus restores them without changing the active row', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
    await waitFor(() => file.getAttribute('aria-selected') === 'true');
    c.window.dispatchEvent(new c.window.Event('blur'));
    assert.equal(c.sent.at(-1).type, 'treeFocus'); assert.equal(c.sent.at(-1).focused, false);
    c.window.dispatchEvent(new c.window.Event('focus'));
    assert.equal(c.sent.at(-1).type, 'treeFocus'); assert.equal(c.sent.at(-1).focused, true);
    assert.equal(c.document.activeElement, file);
    const button = file.querySelector('button'); button.focus();
    c.window.dispatchEvent(new c.window.Event('focus'));
    assert.equal(c.sent.at(-1).focused, false);
  } finally { await c.dispose(); }
});

test('a delayed active-document reveal does not change the keyboard target while the tree owns focus', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
    await c.receive({ expandedIds: ['folder'], revealId: 'guide', revealRevision: 1 });
    assert.equal(c.document.activeElement, file); assert.equal(file.getAttribute('aria-selected'), 'true');
    assert.equal(c.sent.findLast(message => message.type === 'selection').id, 'readme');
  } finally { await c.dispose(); }
});

test('double-clicking an inline action does not open the file or toggle the folder again', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]');
    file.querySelector('button').dispatchEvent(new c.window.MouseEvent('dblclick', { bubbles: true, detail: 2 }));
    assert.equal(c.sent.filter(message => ['openTab', 'openPreview'].includes(message.type)).length, 0);
    const row = c.document.querySelector('[data-entry="folder"] .file-row');
    for (const [type, detail] of [['click', 1], ['click', 2], ['dblclick', 2]]) row.dispatchEvent(new c.window.MouseEvent(type, { bubbles: true, detail }));
    assert.equal(c.sent.filter(message => message.type === 'expand').length, 1);
  } finally { await c.dispose(); }
});

test('returning from an editor restores the last tree row when the Webview reset DOM focus to body', async () => {
  const c = await client();
  try {
    const file = c.document.querySelector('[data-entry="readme"]'); file.focus();
    c.window.dispatchEvent(new c.window.Event('blur')); file.blur();
    assert.equal(c.document.activeElement, c.document.body);
    c.document.hasFocus = () => true;
    c.window.dispatchEvent(new c.window.Event('focus'));
    assert.ok(c.document.activeElement === file);
    assert.equal(c.sent.at(-1).type, 'treeFocus'); assert.equal(c.sent.at(-1).focused, true);
    const nav = c.document.querySelector('[aria-label="ファイル一覧"]'); nav.focus();
    c.window.dispatchEvent(new c.window.Event('focus')); assert.equal(c.document.activeElement, nav);
  } finally { await c.dispose(); }
});
