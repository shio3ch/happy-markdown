'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { searchShell } = require('../dist/src/explorer-search');
const { findMatches } = require('../dist/src/workspace-search');

function client() {
  class Element {
    constructor(tag) { this.tag = tag; this.dataset = {}; this.children = []; this.events = {}; this.value = ''; this.disabled = true; }
    addEventListener(type, fn) { this.events[type] = fn; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute() {}
    querySelectorAll() { return []; }
    focus() {}
    set innerHTML(value) { throw new Error('Untrusted HTML must not be parsed'); }
  }
  const elements = Object.fromEntries(['query', 'results', 'status', 'clear'].map(id => [id, new Element('div')]));
  const sent = [];
  let receive;
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/explorer-search.js'), 'utf8'), {
    acquireVsCodeApi: () => ({ postMessage: value => sent.push(value) }),
    document: { getElementById: id => elements[id], createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }), createDocumentFragment: () => new Element('fragment') },
    window: { addEventListener: (type, fn) => { receive = fn; } },
  });
  return { elements, sent, receive: state => receive({ data: { type: 'state', results: [], busy: false, status: '', query: '', requestId: 0, ...state } }) };
}

test('client searches on input, waits for IME composition and ignores old responses', () => {
  const c = client();
  c.receive({});
  const { query, status, clear } = c.elements;
  assert.equal(query.disabled, false);
  query.events.compositionstart();
  query.value = '文'; query.events.input();
  assert.equal(c.sent.length, 1);
  query.value = '文書'; query.events.compositionend();
  assert.equal(c.sent.at(-1).value, '文書');
  assert.equal(c.sent.at(-1).requestId, 1);
  c.receive({ requestId: 0, query: '', status: 'old' });
  assert.equal(status.textContent, '検索中…');
  c.receive({ requestId: 1, query: '文書', status: '2ファイル一致' });
  assert.equal(status.textContent, '2ファイル一致');
  clear.events.click();
  assert.equal(query.value, '');
  assert.equal(c.sent.at(-1).value, '');
});

test('client renders HTML-like filenames and excerpts as text, without parsing markup', () => {
  const c = client();
  c.receive({ query: 'script', results: [{ id: 'safe', label: '<script>alert(1)</script>', path: '<img onerror=x>', count: 1, bookmarked: false, active: false, matches: [{ line: 1, text: '<script>text</script>' }] }] });
  const text = node => [node.textContent || '', ...node.children?.map(text) || []].join('');
  assert.match(text(c.elements.results), /<script>alert\(1\)<\/script>/);
  assert.match(text(c.elements.results), /<img onerror=x>/);
});

test('client ignores malformed state without clearing the current results', () => {
  const c = client();
  c.receive({ status: '現在の結果' });
  c.receive({ status: '不正な結果', results: [null] });
  c.receive({ status: '不正な検索語', query: {} });
  assert.equal(c.elements.status.textContent, '現在の結果');
});

test('search shell enforces CSP and loads only bundled scripts and styles', () => {
  const html = searchShell({ cspSource: 'test-resource:' }, path => path);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'nonce-[a-f0-9]+'/);
  assert.match(html, /dist\/explorer-search.js/);
  assert.doesNotMatch(html, /unsafe-inline|https:|onclick=/);
});

test('long line excerpts include the actual matching text', () => {
  assert.match(findMatches('a'.repeat(400) + '検索語' + 'b'.repeat(400), '検索語')[0].text, /検索語/);
});
