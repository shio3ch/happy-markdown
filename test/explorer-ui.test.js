'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explorerShell } = require('../dist/src/explorer-view');
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
    key(c, folder, 'r');
    assert.equal(c.document.activeElement.dataset.entry, 'readme');
    key(c, c.document.activeElement, 'Home');
    key(c, folder, 'End');
    assert.equal(c.document.activeElement.dataset.entry, 'readme');
    key(c, c.document.activeElement, 'Enter');
    assert.equal(c.sent.at(-1).type, 'open'); assert.equal(c.sent.at(-1).id, 'readme');
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
    file.focus(); key(c, file, 'F10', { shiftKey: true });
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
    assert.equal(c.sent.at(-1).type, 'source'); assert.equal(c.sent.at(-1).id, 'readme');
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
