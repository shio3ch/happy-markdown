'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explorerShell } = require('../dist/src/explorer-view');
const { findMatches } = require('../dist/src/workspace-search');
const { webview } = require('./webview-helper');

async function client() {
  const c = await webview('explorer', explorerShell({ cspSource: 'https://webview.test' }, path => path));
  return { ...c, receive: state => c.receive({ type: 'state', mode: 'search', nodes: [], expandedIds: [], followActive: true, hasWorkspace: true, revealRevision: 0, results: [], busy: false, status: '', query: '', requestId: 0, ...state }) };
}

test('React search handles input, IME composition, old responses and clearing', async () => {
  const c = await client();
  try {
    await c.receive({});
    const query = c.document.getElementById('query'), status = c.document.getElementById('status');
    assert.equal(query.disabled, false);
    query.dispatchEvent(new c.window.CompositionEvent('compositionstart', { bubbles: true }));
    await c.input(query, '文');
    assert.equal(c.sent.length, 1);
    Object.getOwnPropertyDescriptor(c.window.HTMLInputElement.prototype, 'value').set.call(query, '文書');
    query.dispatchEvent(new c.window.CompositionEvent('compositionend', { bubbles: true, data: '文書' }));
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(c.sent.at(-1).value, '文書');
    assert.equal(c.sent.at(-1).requestId, 1);
    await c.receive({ requestId: 0, query: '', status: 'old' });
    assert.equal(status.textContent, '検索中…');
    await c.receive({ requestId: 1, query: '文書', status: '2ファイル一致' });
    assert.equal(status.textContent, '2ファイル一致');
    c.document.getElementById('clear').click();
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(query.value, '');
    assert.equal(c.sent.at(-1).value, '');
    assert.equal(c.document.activeElement, query);
  } finally { await c.dispose(); }
});

test('React escapes filenames and excerpts and preserves focused result actions across updates', async () => {
  const c = await client();
  try {
    const result = { id: 'safe', label: '<script>alert(1)</script>', path: '<img onerror=x>', count: 1, bookmarked: false, active: false, matches: [{ line: 1, text: '<script>text</script>' }] };
    await c.receive({ query: 'script', results: [result] });
    const results = c.document.getElementById('results');
    assert.match(results.textContent, /<script>alert\(1\)<\/script>/);
    assert.match(results.textContent, /<img onerror=x>/);
    assert.equal(results.querySelector('script,img'), null);
    const button = results.querySelector('[data-action="bookmark"]');
    button.focus(); button.click();
    assert.equal(c.sent.at(-1).type, 'bookmark');
    assert.equal(c.sent.at(-1).id, 'safe');
    await c.receive({ query: 'script', results: [{ ...result, bookmarked: true, active: true }] });
    assert.equal(c.document.activeElement, button);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.match(button.textContent, /解除/);
  } finally { await c.dispose(); }
});

test('React search ignores malformed states without clearing current results', async () => {
  const c = await client();
  try {
    await c.receive({ status: '現在の結果' });
    await c.receive({ status: '不正な結果', results: [null] });
    await c.receive({ status: '不正な検索語', query: {} });
    assert.equal(c.document.getElementById('status').textContent, '現在の結果');
  } finally { await c.dispose(); }
});

test('search shell enforces CSP and loads only bundled scripts and styles', () => {
  const html = explorerShell({ cspSource: 'test-resource:' }, path => path);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'nonce-[a-f0-9]+'/);
  assert.match(html, /dist\/explorer.js/);
  assert.match(html, /id="root"/);
  assert.doesNotMatch(html, /unsafe-inline|https:|onclick=/);
});

test('long line excerpts include the actual matching text', () => {
  assert.match(findMatches('a'.repeat(400) + '検索語' + 'b'.repeat(400), '検索語')[0].text, /検索語/);
});
