'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shell } = require('../dist/extension/shell');
const { renderMarkdown } = require('../dist/extension/markdown');
const { webview, waitFor } = require('./webview-helper');
const { WorkbenchController } = require('../dist/webview/workbench-controller');

const snapshot = (text, version = 1, extra = {}) => ({ type: 'snapshot', text, version, html: renderMarkdown(text).html, dirty: false, ...extra });
const client = (restored = { mode: 'preview' }) => webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path), restored);

test('new documents open directly in live editing while restored preview mode is respected', async () => {
  const c = await webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path));
  try {
    await c.receive(snapshot('# 見出し\n\n**太字**\n\n本文'));
    await waitFor(() => c.document.body.dataset.mode === 'edit');
    assert.equal(c.document.getElementById('editor').hidden, false);
    assert.ok(c.document.querySelector('.cm-live-heading'));
    assert.ok(c.document.querySelector('.cm-live-strong'));
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
  } finally { await c.dispose(); }
});

test('table input retains newer cell drafts through acknowledgements, conflicts and mode changes', async () => {
  const c = await client({ mode: 'edit' });
  try {
    const original = '| A | B |\n| --- | --- |\n| 元 | 維持 |\n\n末尾';
    await c.receive(snapshot(original));
    const cell = c.document.querySelector('td .cm-table-cell');
    cell.focus(); cell.textContent = '入力1';
    cell.dispatchEvent(new c.window.InputEvent('input', { bubbles: true }));
    const first = c.sent.find(message => message.type === 'edit');
    assert.equal(first.text, original.replace('元', '入力1'));
    cell.textContent = '入力2'; cell.dispatchEvent(new c.window.InputEvent('input', { bubbles: true }));
    await c.receive(snapshot(first.text, 2, { id: first.id }));
    assert.equal(c.document.querySelector('td .cm-table-cell') === cell, true);
    assert.equal(cell.textContent, '入力2');
    const second = c.sent.filter(message => message.type === 'edit').at(-1);
    assert.equal(second.text, original.replace('元', '入力2'));
    await c.receive(snapshot(original.replace('元', '外部'), 3));
    assert.equal(c.document.getElementById('conflict').hidden, false);
    assert.equal(cell.textContent, '入力2');
    assert.equal(c.persisted.at(-1).draft, second.text);
    await c.receive(snapshot(original.replace('元', '外部'), 3, { id: second.id, rejected: true }));
    c.document.getElementById('use-draft').click();
    await waitFor(() => c.sent.filter(message => message.type === 'edit').length === 3);
    const retry = c.sent.filter(message => message.type === 'edit').at(-1);
    assert.equal(retry.text, second.text);
    await c.receive(snapshot(retry.text, 4, { id: retry.id }));
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.body.dataset.mode === 'preview');
    assert.equal(c.document.querySelector('#document td').textContent, '入力2');
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.body.dataset.mode === 'edit');
    assert.equal(c.document.querySelector('td .cm-table-cell') === cell, true);
    assert.equal(cell.textContent, '入力2');
  } finally { await c.dispose(); }
});

test('React workbench retains one CodeMirror instance through editing, acknowledgements and mode changes', async () => {
  const c = await client();
  try {
    await c.receive(snapshot('# 文書\n\n本文'));
    assert.match(c.document.querySelector('#document').textContent, /本文/);
    const editor = c.document.querySelector('.cm-editor');
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.body.dataset.mode === 'edit');
    c.document.getElementById('bold').click();
    const edit = c.sent.find(message => message.type === 'edit');
    assert.ok(edit.text.includes('**テキスト**'));
    assert.ok(c.persisted.at(-1).draft.includes('**テキスト**'));
    // 反映前の切り替えは応答を待ち、別の描画で入力を失わない。
    c.document.getElementById('mode').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(c.document.body.dataset.mode, 'edit');
    await c.receive(snapshot(edit.text, 2, { id: edit.id }));
    await waitFor(() => c.document.body.dataset.mode === 'preview');
    assert.equal(c.document.querySelector('.cm-editor'), editor);
    assert.ok(c.document.querySelector('#document strong'));
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.body.dataset.mode === 'edit');
    assert.equal(c.document.querySelector('.cm-editor'), editor);
    assert.match(editor.textContent, /テキスト/);
  } finally { await c.dispose(); }
});

test('table structure changes keep newer drafts during acknowledgements and deletion can be undone by the host', async () => {
  const c = await client({ mode: 'edit' });
  try {
    const original = '| A | B |\n| --- | ---: |\n| 一 | 二 |\n| 三 | 四 |\n\n後';
    await c.receive(snapshot(original));
    c.document.querySelector('.cm-table-row-handle[data-index="1"]').click();
    c.document.querySelector('.cm-table-menu [data-command="delete"]').click();
    const first = c.sent.find(message => message.type === 'edit');
    assert.equal(first.text, '| A | B |\n| --- | ---: |\n| 三 | 四 |\n\n後');
    const handle = c.document.querySelector('.cm-table-column-handle[data-index="0"]');
    handle.focus(); handle.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    await c.receive(snapshot(first.text, 2, { id: first.id }));
    assert.deepEqual([...c.document.querySelectorAll('.cm-live-table th')].map(td => td.textContent), ['B', 'A']);
    const second = c.sent.filter(message => message.type === 'edit').at(-1);
    assert.equal(second.text, '| B | A |\n| ---: | --- |\n| 四 | 三 |\n\n後');
    await c.receive(snapshot(second.text, 3, { id: second.id }));
    c.document.querySelector('.cm-table-options').click();
    c.document.querySelector('[aria-label="テーブルを削除"]').click();
    const deletion = c.sent.filter(message => message.type === 'edit').at(-1);
    assert.equal(deletion.text, '\n後');
    await c.receive(snapshot(deletion.text, 4, { id: deletion.id }));
    assert.equal(c.document.querySelector('.cm-live-table'), null);
    c.document.getElementById('undo').click();
    await waitFor(() => c.sent.at(-1).type === 'undo');
    await c.receive(snapshot(second.text, 5));
    assert.deepEqual([...c.document.querySelectorAll('.cm-live-table th')].map(td => td.textContent), ['B', 'A']);
    assert.deepEqual([...c.document.querySelectorAll('.cm-live-table td')].map(td => td.textContent), ['四', '三']);
  } finally { await c.dispose(); }
});

test('React preview retains details, scroll and task focus and supports search and outline navigation', async () => {
  const c = await client();
  try {
    const text = '# 見出し\n\n本文 **本文**\n\n<details><summary>補足</summary>本文</details>\n\n- [ ] task';
    await c.receive(snapshot(text));
    const root = c.document.getElementById('document');
    root.querySelector('details').open = true; root.scrollTop = 77;
    root.querySelector('input').focus(); root.querySelector('input').click();
    assert.equal(c.sent.at(-1).type, 'toggle');
    assert.equal(c.sent.at(-1).version, 1);
    assert.equal(root.querySelector('input').disabled, true);
    await c.receive(snapshot(text.replace('[ ]', '[x]'), 2));
    assert.equal(root.querySelector('details').open, true);
    assert.equal(root.scrollTop, 77);
    assert.equal(c.document.activeElement, root.querySelector('input'));
    assert.match(c.document.getElementById('progress').textContent, /1\/1/);
    await c.input(c.document.getElementById('search'), '本文');
    assert.equal(root.querySelectorAll('mark[data-search]').length, 3);
    assert.equal(c.document.getElementById('search-count').textContent, '1 / 3');
    c.document.getElementById('search-next').click();
    await waitFor(() => c.document.getElementById('search-count').textContent === '2 / 3');
    c.document.getElementById('search-prev').click();
    await waitFor(() => c.document.getElementById('search-count').textContent === '1 / 3');
    const search = c.document.getElementById('search');
    search.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    await waitFor(() => c.document.getElementById('search-count').textContent === '3 / 3');
    search.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitFor(() => c.document.getElementById('search-count').textContent === '1 / 3');
    await c.input(search, '一致しない語句');
    assert.equal(c.document.getElementById('search-prev').disabled, true);
    assert.equal(c.document.getElementById('search-next').disabled, true);
    const toc = c.document.getElementById('toc'); toc.focus();
    toc.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await waitFor(() => c.document.activeElement === c.document.querySelector('#toc-options button'));
    c.document.activeElement.click();
    await waitFor(() => c.document.getElementById('toc-options').hidden);
    assert.equal(c.document.activeElement, root.querySelector('h1'));
  } finally { await c.dispose(); }
});

test('icon toolbar keeps accessible names and keyboard access to heading choices', async () => {
  const c = await client();
  try {
    await c.receive(snapshot('本文'));
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.body.dataset.mode === 'edit');
    for (const id of ['bold', 'italic', 'underline', 'strike', 'heading', 'toc', 'search-prev', 'search-next']) {
      const button = c.document.getElementById(id);
      assert.ok(button.getAttribute('aria-label'), `${id}には操作名がある`);
      assert.ok(button.querySelector('svg[aria-hidden="true"]'), `${id}のアイコンは読み上げ対象外`);
    }
    const heading = c.document.getElementById('heading');
    heading.focus();
    await waitFor(() => heading.getAttribute('aria-expanded') === 'true');
    heading.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await waitFor(() => c.document.activeElement === c.document.querySelector('#heading-options button'));
    c.document.activeElement.click();
    await waitFor(() => c.sent.some(message => message.type === 'edit'));
    assert.equal(c.sent.find(message => message.type === 'edit').text, '# 本文');
    await waitFor(() => heading.getAttribute('aria-expanded') === 'false');
  } finally { await c.dispose(); }
});

test('restored conflicting drafts stay visible and require an explicit conflict choice', async () => {
  const c = await client({ mode: 'edit', draft: '入力中の文章', baseText: '以前の本文' });
  try {
    await c.receive(snapshot('外部で更新された本文'));
    assert.equal(c.document.getElementById('conflict').hidden, false);
    assert.match(c.document.querySelector('.cm-content').textContent, /入力中の文章/);
    assert.equal(c.persisted.at(-1).draft, '入力中の文章');
    c.document.getElementById('use-latest').click();
    await waitFor(() => c.document.getElementById('conflict').hidden);
    assert.match(c.document.querySelector('.cm-content').textContent, /外部で更新された本文/);
  } finally { await c.dispose(); }
});

test('controller ignores stale snapshots and flushes pending edits before save', async () => {
  const sent = [];
  const controller = new WorkbenchController({ getState() {}, setState() {}, postMessage: message => sent.push(message) });
  controller.receive(snapshot('a', 3));
  controller.edit('ab');
  const saving = controller.action('save');
  assert.equal(sent.filter(message => message.type === 'save').length, 0);
  controller.receive(snapshot('obsolete', 2));
  assert.equal(controller.getSnapshot().snapshot.text, 'a');
  assert.equal(controller.session.text, 'ab');
  controller.receive(snapshot('ab', 4, { id: sent[0].id }));
  await saving;
  assert.equal(sent.at(-1).type, 'save');
});

test('React image insertion and save shortcuts use the existing host message protocol', async () => {
  const c = await client();
  try {
    await c.receive(snapshot(''));
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.body.dataset.mode === 'edit');
    c.document.getElementById('image').click();
    await waitFor(() => !c.document.getElementById('image-options').hidden);
    c.document.getElementById('image-file').click();
    await waitFor(() => c.sent.at(-1).type === 'pickImage');
    assert.equal(c.document.getElementById('image-file').disabled, true);
    await c.receive({ type: 'imageResult', path: 'assets/test.png' });
    const edit = c.sent.at(-1);
    assert.equal(edit.type, 'edit');
    assert.equal(edit.text, '![画像の説明](assets/test.png)');
    await c.receive(snapshot(edit.text, 2, { id: edit.id }));
    c.document.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    await waitFor(() => c.sent.at(-1).type === 'save');
    assert.equal(c.document.getElementById('image-file').disabled, false);
    c.document.getElementById('heading').focus();
    await waitFor(() => !c.document.getElementById('heading-options').hidden);
    c.document.querySelector('#heading-options button').focus();
    c.document.activeElement.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => c.document.getElementById('heading-options').hidden);
    assert.equal(c.document.activeElement, c.document.getElementById('heading'));
  } finally { await c.dispose(); }
});

test('image requests wait once for pending edits and cancellation releases the button', async () => {
  const sent = [];
  const controller = new WorkbenchController({ getState() {}, setState() {}, postMessage: message => sent.push(message) });
  controller.receive(snapshot('a'));
  controller.edit('ab');
  const first = controller.pickImage(), second = controller.pickImage();
  assert.equal(sent.filter(message => message.type === 'pickImage').length, 0);
  controller.receive(snapshot('ab', 2, { id: sent[0].id }));
  await Promise.all([first, second]);
  assert.equal(sent.filter(message => message.type === 'pickImage').length, 1);
  assert.equal(controller.getSnapshot().imageBusy, true);
  controller.receive({ type: 'imageResult' });
  assert.equal(controller.getSnapshot().imageBusy, false);
});

test('workbench shell retains CSP and delegates UI markup to the React root', () => {
  const html = shell({ cspSource: 'test-resource:' }, path => path);
  assert.match(html, /id="root"/);
  assert.match(html, /script-src 'nonce-[a-f0-9]+'/);
  assert.match(html, /style-src test-resource: 'nonce-[a-f0-9]+'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|onclick=/);
});
