'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isEditorMessage, isSearchMessage, isDocumentSnapshot, isImageResult, isSearchState } = require('../dist/shared/messages');

test('editor messages validate edit IDs, document versions and checkbox values at runtime', () => {
  const edit = { type: 'edit', id: 1, version: 2, text: '本文' };
  assert.equal(isEditorMessage(edit), true);
  assert.equal(isEditorMessage({ type: 'toggle', id: '0', version: 2, checked: true }), true);
  for (const value of [null, [], { ...edit, id: '1' }, { ...edit, id: NaN },
    { ...edit, version: -1 }, { ...edit, version: 1.5 }, { ...edit, text: {} },
    { type: 'toggle', id: '0', version: 2, checked: 'yes' }, { type: 'link', href: {} }]) {
    assert.equal(isEditorMessage(value), false);
  }
});

test('search messages reject malformed input and keep result action IDs as strings', () => {
  assert.equal(isSearchMessage({ type: 'query', value: '検索', requestId: 1 }), true);
  assert.equal(isSearchMessage({ type: 'bookmark', id: 'file:///docs/a.md' }), true);
  for (const value of [null, { type: 'query', value: {}, requestId: 1 },
    { type: 'query', value: '検索', requestId: -1 }, { type: 'open', id: 1 }, { type: 'unknown' }]) {
    assert.equal(isSearchMessage(value), false);
  }
});

test('snapshots and image results reject malformed fields before changing the editor', () => {
  const snapshot = { type: 'snapshot', text: '本文', html: '<p>本文</p>', version: 1, dirty: false };
  assert.equal(isDocumentSnapshot(snapshot), true);
  assert.equal(isDocumentSnapshot({ ...snapshot, id: 1, rejected: true }), true);
  for (const value of [{ ...snapshot, text: {} }, { ...snapshot, html: 42 },
    { ...snapshot, version: NaN }, { ...snapshot, rejected: 'yes' }, { ...snapshot, id: '1' }]) {
    assert.equal(isDocumentSnapshot(value), false);
  }
  assert.equal(isImageResult({ type: 'imageResult' }), true); // ファイル選択のキャンセル
  assert.equal(isImageResult({ type: 'imageResult', path: 'assets/a.png' }), true);
  assert.equal(isImageResult({ type: 'imageResult', path: {} }), false);
  assert.equal(isImageResult({ type: 'imageResult', message: [] }), false);
});

test('search state validates nested results and excerpts', () => {
  const result = { id: 'file:///docs/a.md', label: 'a.md', path: 'docs/a.md', count: 1,
    matches: [{ line: 1, text: '本文' }], bookmarked: false, active: true };
  const state = { type: 'state', busy: false, query: '本文', requestId: 1, status: '1ファイル一致', results: [result] };
  assert.equal(isSearchState(state), true);
  for (const results of [[null], [{ ...result, matches: [null] }],
    [{ ...result, matches: [{ line: '1', text: '本文' }] }], [{ ...result, label: {} }]]) {
    assert.equal(isSearchState({ ...state, results }), false);
  }
});

test('explorer protocol validates modes, expansion and nested file entries', () => {
  const { isExplorerMessage, isExplorerState } = require('../dist/shared/messages');
  assert.equal(isExplorerMessage({ type: 'mode', mode: 'bookmarks' }), true);
  assert.equal(isExplorerMessage({ type: 'expand', id: 'folder', expanded: true }), true);
  for (const value of [{ type: 'mode', mode: 'unknown' }, { type: 'expand', id: 'folder', expanded: 'yes' }, { type: 'follow', enabled: 1 }]) {
    assert.equal(isExplorerMessage(value), false);
  }
  const node = { id: 'folder', label: '入門', path: '/docs/入門', bookmarked: false, active: false, icon: { light: 'light.svg', dark: 'dark.svg' }, children: [] };
  const state = { type: 'state', mode: 'files', busy: false, query: '', requestId: 0, status: '', results: [], nodes: [node],
    expandedIds: ['folder'], followActive: true, hasWorkspace: true, revealRevision: 0 };
  assert.equal(isExplorerState(state), true);
  const circular = { ...node }; circular.children = [circular];
  assert.equal(isExplorerState({ ...state, nodes: [circular] }), false);
  assert.equal(isExplorerState({ ...state, nodes: [node, node] }), false);
  for (const value of [{ ...state, nodes: [{ ...node, children: [null] }] }, { ...state, nodes: [{ ...node, icon: {} }] }, { ...state, expandedIds: [42] }]) {
    assert.equal(isExplorerState(value), false);
  }
});
