'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const { createEditor } = require('../dist/webview/editor');
const { renderMarkdown } = require('../dist/extension/markdown');

async function editor(run) {
  const errors = [], changes = [], actions = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM('<!doctype html><body class="workbench"><div id="editor"></div></body>', { pretendToBeVisual: true, virtualConsole: console });
  const { window } = dom;
  window.HTMLElement.prototype.setPointerCapture = function(id) { this.capturedPointer = id; };
  window.HTMLElement.prototype.hasPointerCapture = function(id) { return this.capturedPointer === id; };
  window.HTMLElement.prototype.releasePointerCapture = function() { delete this.capturedPointer; };
  window.Range.prototype.getClientRects = () => [];
  window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  const globals = ['window', 'document', 'navigator', 'MutationObserver', 'HTMLElement', 'HTMLButtonElement', 'Element', 'Node', 'Window', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const saved = globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const key of globals) Object.defineProperty(globalThis, key, { configurable: true, value: typeof window[key] === 'function' && /^(getComputedStyle|requestAnimationFrame|cancelAnimationFrame)$/.test(key) ? window[key].bind(window) : window[key] });
  const e = createEditor(window.document.getElementById('editor'), text => changes.push(text), {
    save: () => actions.push('save'), undo: () => actions.push('undo'), redo: () => actions.push('redo'),
  });
  // jsdomのCSS優先度計算は限定的なので、CodeMirrorの基本ルールの後に読み込む。
  for (const file of ['preview', 'workbench']) {
    const style = window.document.createElement('style');
    style.textContent = fs.readFileSync(require.resolve(`../styles/${file}.css`), 'utf8');
    window.document.head.append(style);
  }
  const select = (anchor, head = anchor) => e.view.dispatch({ selection: { anchor, head } });
  try {
    await run({ ...e, window, document: window.document, changes, actions, select });
    assert.deepEqual(errors, []);
  } finally {
    e.destroy();
    dom.window.close();
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const inputCell = (c, element, text) => {
  element.focus(); element.textContent = text;
  element.dispatchEvent(new c.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
};

test('list hierarchy decorations keep source indentation, ordered starts and cursor positions intact', () => editor(c => {
  const text = '- 親\n  - 子\n\n    7. 孫\n\n末尾';
  c.setText(text); c.select(text.length);
  assert.ok(c.document.querySelector('.cm-live-list-depth-1'));
  assert.ok(c.document.querySelector('.cm-live-list-depth-2'));
  assert.ok(c.document.querySelector('.cm-live-list-depth-3'));
  assert.equal(c.document.querySelector('.cm-live-list-depth-3 .cm-live-list-marker').textContent, '7.');
  const cursor = text.indexOf('子'); c.select(cursor);
  assert.equal(c.document.querySelector('.cm-live-list-depth-2'), null);
  assert.match(c.view.contentDOM.textContent, /  - 子/);
  assert.equal(c.view.state.selection.main.head, cursor);
  assert.equal(c.view.state.doc.toString(), text);
  assert.deepEqual(c.changes, []);
}));

test('Mermaid block decorations preserve source, edits, selections, CRLF and composition', () => editor(c => {
  const text = '前\r\n\r\n```mermaid\r\nflowchart LR\r\n A --> B\r\n```\r\n\r\n後';
  c.setText(text); c.select(c.view.state.doc.length);
  const original = c.view.state.doc.toString();
  assert.ok(c.view.contentDOM.querySelector('.cm-live-mermaid'));
  assert.deepEqual(c.changes, []);
  const sourcePosition = original.indexOf('flowchart');
  c.select(sourcePosition);
  assert.equal(c.view.contentDOM.querySelector('.cm-live-mermaid'), null);
  assert.match(c.view.contentDOM.textContent, /flowchart LR/);
  c.view.dispatch({ changes: { from: original.indexOf('A -->'), to: original.indexOf('A -->') + 1, insert: '開始' } });
  assert.equal(c.changes.at(-1), original.replace('A -->', '開始 -->'));
  c.select(c.view.state.doc.length);
  const widget = c.view.contentDOM.querySelector('.cm-live-mermaid');
  assert.ok(widget);
  c.view.contentDOM.dispatchEvent(new c.window.CompositionEvent('compositionstart', { bubbles: true }));
  c.select(0);
  assert.equal(c.view.contentDOM.querySelector('.cm-live-mermaid'), widget);
  c.view.contentDOM.dispatchEvent(new c.window.CompositionEvent('compositionend', { bubbles: true }));
  c.select(0, c.view.state.doc.length);
  assert.equal(c.view.state.doc.toString(), original.replace('A -->', '開始 -->'));
}));

test('Mermaid leaves unclosed, nested and ordinary fences as source and reveals intersecting selections', () => editor(c => {
  for (const text of ['```mermaid\nflowchart LR\n A --> B', '> ```mermaid\n> flowchart LR\n> ```', '```text\nflowchart LR\n A --> B\n```']) {
    c.setText(text + '\n\n後'); c.select(c.view.state.doc.length);
    assert.equal(c.view.contentDOM.querySelector('.cm-live-mermaid'), null);
  }
  const text = '前\n\n~~~mermaid\nflowchart LR\n A --> B\n~~~\n\n後';
  c.setText(text); c.select(text.length);
  assert.ok(c.view.contentDOM.querySelector('.cm-live-mermaid'));
  c.select(0, text.length);
  assert.equal(c.view.contentDOM.querySelector('.cm-live-mermaid'), null);
  assert.equal(c.view.state.doc.toString(), text);
}));
const tableControl = (c, axis, boundary, remove = false) => {
  const root = c.view.contentDOM.querySelector('.cm-live-table');
  const count = root.querySelectorAll(`.cm-table-${axis}-handle`).length;
  const index = remove ? boundary - 1 : Math.min(boundary, count - 1);
  root.querySelector(`.cm-table-${axis}-handle[data-index="${index}"]`).click();
  return root.querySelector(`.cm-table-menu [data-command="${remove ? 'delete' : boundary === count ? 'after' : 'before'}"]`);
};
const deleteWholeTable = c => {
  c.view.contentDOM.querySelector('.cm-table-options').click();
  c.view.contentDOM.querySelector('.cm-table-menu [aria-label="テーブルを削除"]').click();
};
const pointerEvent = (c, element, type, x, y) => {
  const event = new c.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, 'pointerId', { value: 1 }); element.dispatchEvent(event); return event;
};
const measureTable = async c => {
  const root = c.view.contentDOM.querySelector('.cm-live-table'), table = root.querySelector('table');
  const width = table.rows[0].cells.length * 100, height = table.rows.length * 40;
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  root.getBoundingClientRect = () => rect(0, 0, width + 50, height + 30);
  root.querySelector('.cm-table-scroll').getBoundingClientRect = () => rect(50, 30, width, height);
  table.getBoundingClientRect = () => rect(50, 30, width, height);
  [...table.rows].forEach((row, index) => { row.getBoundingClientRect = () => rect(50, 30 + index * 40, width, 40); });
  [...table.rows[0].cells].forEach((cell, index) => { cell.getBoundingClientRect = () => rect(50 + index * 100, 30, 100, 40); });
  root.querySelector('.cm-table-scroll').dispatchEvent(new c.window.Event('scroll'));
  await new Promise(resolve => c.window.requestAnimationFrame(resolve));
  return root;
};
const moveTable = async (c, axis, index, boundary) => {
  const root = await measureTable(c);
  const handle = root.querySelector(`.cm-table-${axis}-handle[data-index="${index}"]`);
  pointerEvent(c, handle, 'pointerdown', axis === 'row' ? 25 : 100 + index * 100, axis === 'row' ? 50 + index * 40 : 10);
  pointerEvent(c, handle, 'pointermove', axis === 'row' ? 100 : 50 + boundary * 100, axis === 'row' ? 30 + boundary * 40 : 70);
  assert.equal(root.querySelector('.cm-table-drop-target').dataset.boundary, String(boundary));
  pointerEvent(c, handle, 'pointerup', axis === 'row' ? 100 : 50 + boundary * 100, axis === 'row' ? 30 + boundary * 40 : 70);
};

test('live editing and preview share heading and inline styles while only explicit rules draw a line', () => editor(c => {
  const text = Array.from({ length: 7 }, (_, index) => '#'.repeat(index + 1) + ' 見出し' + (index + 1)).join('\n\n')
    + '\n\n**太字** *斜体* ~~取消~~ <u>下線</u> `コード` [リンク](https://example.com)\n\n> 引用\n\n```text\nコード\n```\n\n- [x] 完了\n\n---\n\n末尾';
  const preview = c.document.createElement('article');
  preview.id = 'document';
  preview.innerHTML = renderMarkdown(text).html;
  c.document.body.append(preview);
  c.setText(text); c.select(text.length);
  const equalStyles = (live, rendered, properties) => {
    const a = c.window.getComputedStyle(live), b = c.window.getComputedStyle(rendered);
    for (const property of properties) assert.equal(a[property], b[property], `${live.className}: ${property}`);
  };
  for (let level = 1; level <= 7; level++) {
    const live = c.view.contentDOM.querySelector(`.cm-live-h${level}`);
    const rendered = preview.querySelector(level === 7 ? '[data-heading-level="7"]' : `h${level}:not([data-heading-level])`);
    equalStyles(live, rendered, ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'borderBottomWidth', 'paddingTop', 'paddingBottom']);
    assert.equal(c.window.getComputedStyle(rendered).borderBottomWidth, '0px');
    // CodeMirrorの構文色分けが本文色・太さを上書きしない。
    for (const child of live.querySelectorAll('span')) {
      const style = c.window.getComputedStyle(child), parent = c.window.getComputedStyle(rendered);
      for (const property of ['color', 'fontWeight'])
        assert.ok(['', 'inherit', parent[property]].includes(style[property]), `見出し内の${property}を上書きしない`);
    }
  }
  for (const [live, rendered, properties] of [
    ['.cm-live-strong', 'strong', ['fontWeight']], ['.cm-live-emphasis', 'em', ['fontStyle']],
    ['.cm-live-strike', 's', ['textDecoration']], ['.cm-live-underline', 'u', ['textDecoration', 'textUnderlineOffset']],
    ['.cm-live-code', 'code', ['fontSize', 'fontFamily', 'padding', 'borderRadius', 'backgroundColor', 'color']],
    ['.cm-live-link', 'a', ['color', 'textDecoration', 'textUnderlineOffset']],
    ['.cm-live-quote', 'blockquote', ['padding', 'borderLeftWidth', 'borderLeftStyle', 'borderLeftColor', 'backgroundColor']],
    ['.cm-live-codeblock', 'pre', ['fontFamily', 'fontSize', 'lineHeight', 'padding', 'borderRadius', 'backgroundColor']],
    ['.cm-live-task', 'input[type="checkbox"]', ['width', 'height', 'font', 'border', 'borderRadius', 'backgroundColor', 'color']],
  ]) equalStyles(c.view.contentDOM.querySelector(live), preview.querySelector(rendered), properties);
  const rule = c.window.getComputedStyle(preview.querySelector('hr'));
  assert.equal(rule.borderTopWidth, '1px');
  equalStyles(c.view.contentDOM.querySelector('.cm-live-rule'), preview.querySelector('hr'), ['borderTopWidth', 'borderTopStyle', 'borderTopColor']);
}));

test('live editor renders Markdown without changing the document and reveals selected lines', () => editor(c => {
  const text = '# 見出し\n\n**太字** *斜体* ~~取消~~ `code` <u>下線</u> [リンク](https://example.com)\n\n- 箇条書き\n\n> 引用\n\n---\n\n####### 見出し7\n\n末尾';
  c.setText(text);
  c.select(text.length);
  const content = c.view.contentDOM;
  for (const name of ['heading', 'h7', 'strong', 'emphasis', 'strike', 'code', 'underline', 'link', 'bullet', 'quote', 'rule'])
    assert.ok(content.querySelector(`.cm-live-${name}`), name);
  assert.doesNotMatch(content.textContent, /\*\*|~~|https:\/\/example|<u>|#######/);
  assert.equal(c.view.state.doc.toString(), text);
  assert.deepEqual(c.changes, []);
  c.select(text.indexOf('太字'));
  assert.match(content.textContent, /\*\*太字\*\*/);
  assert.match(content.textContent, /\[リンク\]\(https:\/\/example.com\)/);
  assert.ok(content.querySelector('.cm-live-strong'));
  c.select(0, text.indexOf('箇条書き'));
  assert.match(content.textContent, /# 見出し/);
  assert.match(content.textContent, /\*\*太字\*\*/);
  c.select(text.length);
  assert.doesNotMatch(content.textContent, /\*\*/);
  assert.equal(c.view.state.doc.toString(), text);
}));

test('tables retain preview styling while cells are edited directly without revealing source', () => editor(c => {
  const table = '| 名前 | 数 | 備考 |\n| :--- | ---: | :---: |\n| **項目** | 10 | `a\\|b` |\n| 空 | | *説明* |';
  const text = '前文\n\n' + table + '\n\n末尾';
  c.setText(text); c.select(text.length);
  const rendered = c.view.contentDOM.querySelector('.cm-live-table table');
  assert.ok(rendered);
  assert.equal(rendered.querySelectorAll('th').length, 3);
  assert.equal(rendered.querySelector('th .cm-table-cell').getAttribute('contenteditable'), 'true');
  assert.equal(rendered.querySelector('th').getAttribute('scope'), 'col');
  assert.equal(rendered.querySelectorAll('tbody tr').length, 2);
  assert.deepEqual([...rendered.querySelectorAll('th')].map(cell => cell.getAttribute('align')), ['left', 'right', 'center']);
  assert.equal(rendered.querySelector('strong').textContent, '項目');
  assert.equal(rendered.querySelector('code').textContent, 'a|b');
  assert.equal(rendered.querySelector('em').textContent, '説明');
  const preview = c.document.createElement('div');
  preview.innerHTML = renderMarkdown(table).html;
  c.document.body.append(preview);
  for (const [index, cell] of [...rendered.querySelectorAll('th, td')].entries()) {
    const expected = preview.querySelectorAll('th, td')[index];
    assert.equal(cell.textContent, expected.textContent);
    for (const property of ['padding', 'backgroundColor', 'fontWeight', 'textAlign'])
      assert.equal(c.window.getComputedStyle(cell)[property], c.window.getComputedStyle(expected)[property]);
  }
  assert.equal(c.view.state.doc.toString(), text);
  assert.deepEqual(c.changes, []);
  c.select(text.indexOf('項目'));
  assert.ok(c.view.contentDOM.querySelector('.cm-live-table'));
  const cell = rendered.querySelector('td .cm-table-cell');
  cell.focus(); cell.querySelector('strong').textContent = '変更';
  cell.dispatchEvent(new c.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  assert.equal(c.view.contentDOM.querySelector('td .cm-table-cell') === cell, true);
  assert.equal(c.document.activeElement === cell, true);
  c.select(c.view.state.doc.length);
  assert.equal(c.view.contentDOM.querySelector('.cm-live-table strong').textContent, '変更');
  assert.equal(c.changes.at(-1), text.replace('項目', '変更'));
}));

test('table keyboard navigation and empty-cell editing keep the table visible', () => editor(c => {
  const text = '前文\n\n| A | B | C |\n| --- | --- | --- |\n| `a\\|b` | | 最後 |\n\n末尾';
  c.setText(text); c.select(text.length);
  let cells = c.view.contentDOM.querySelectorAll('td .cm-table-cell');
  assert.equal(cells[0].textContent, 'a|b');
  cells[1].focus();
  cells[1].textContent = '入力';
  cells[1].dispatchEvent(new c.window.InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  assert.equal(c.view.state.doc.toString(), text.replace('| | 最後', '| 入力| 最後'));
  cells[1].dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement === cells[2], true);
  cells[2].dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement === cells[1], true);
  cells[1].dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(c.view.contentDOM.querySelectorAll('tbody tr').length, 2);
  const last = c.view.contentDOM.querySelectorAll('tbody tr')[1].querySelectorAll('.cm-table-cell')[2];
  last.focus(); last.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement === c.view.contentDOM.querySelectorAll('tbody tr')[2].querySelector('.cm-table-cell'), true);
  assert.ok(c.view.contentDOM.querySelector('table'));
}));

test('Escape can leave a table at the end of the document without typing into a hidden cell', () => editor(c => {
  const text = '| A |\n| --- |\n| 値 |';
  c.setText(text);
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell'); cell.focus();
  cell.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(c.view.state.doc.toString(), text + '\n\n');
  assert.equal(c.view.state.selection.main.head, text.length + 2);
  assert.ok(c.view.contentDOM.querySelector('table'));
}));

test('table composition and remote updates preserve active DOM and keep positions current', () => editor(async c => {
  const text = '前文\n\n| A | B |\n| --- | --- |\n| 一 | 二 |\n\n末尾';
  c.setText(text); c.select(text.length);
  c.select(0, text.indexOf('二') + 1);
  assert.ok(c.view.contentDOM.querySelector('table'));
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell');
  cell.focus();
  cell.dispatchEvent(new c.window.CompositionEvent('compositionstart', { bubbles: true }));
  cell.textContent = '日本語一';
  cell.dispatchEvent(new c.window.InputEvent('input', { bubbles: true, inputType: 'insertCompositionText', isComposing: true }));
  assert.equal(c.view.contentDOM.querySelector('td .cm-table-cell') === cell, true);
  assert.equal(c.view.contentDOM.querySelector('button').disabled, true);
  cell.dispatchEvent(new c.window.CompositionEvent('compositionend', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
  c.select(c.view.state.doc.length);
  assert.match(c.view.contentDOM.querySelector('table').textContent, /日本語一/);
  c.setText('追加\n' + text.replace('二', '更新'));
  c.select(c.view.state.doc.length);
  const cells = c.view.contentDOM.querySelectorAll('td .cm-table-cell');
  assert.equal(cells[1].textContent, '更新');
  cells[1].textContent = '更新後入力';
  cells[1].dispatchEvent(new c.window.InputEvent('input', { bubbles: true }));
  assert.equal(c.view.state.doc.toString(), '追加\n' + text.replace('二', '更新後入力'));
}));

test('table rendering treats HTML, images and unsafe links as inert content and skips code', () => editor(c => {
  const text = '| 内容 |\n| --- |\n| <script>alert(1)</script><img src=x onerror=alert(2)> |\n| <u>下線</u> ![説明](https://example.com/image.png) [リンク](javascript:alert(1)) |\n\n```md\n| 非表示 |\n| --- |\n| コード |\n```\n\n末尾';
  c.setText(text); c.select(text.length);
  const tables = c.view.contentDOM.querySelectorAll('table');
  assert.equal(tables.length, 1);
  assert.equal(Boolean(tables[0].querySelector('script, img, a, iframe, input, [onclick], [onerror]')), false);
  assert.match(tables[0].textContent, /<script>alert\(1\)<\/script>/);
  assert.equal(tables[0].querySelector('u').textContent, '下線');
  assert.match(tables[0].textContent, /説明/);
  assert.equal(c.view.state.doc.toString(), text);
}));

test('nested and ragged tables keep cell positions and non-table text stays editable', () => editor(c => {
  const text = '> | 引用 | 空 |\n> | --- | --- |\n> | 値 | |\n\n- 資料\n\n  | リスト | 数 |\n  | --- | --- |\n  | 行 | 1 |\n\n| 名前 | 備考 |\n| --- | --- |\n| 短い行 |\n| 長い行 | 説明 | 余分 |\n\n| 未完成 | 表 |\n\n末尾';
  c.setText(text); c.select(text.length);
  const tables = c.view.contentDOM.querySelectorAll('.cm-live-table table');
  assert.equal(tables.length, 3);
  assert.equal(tables[2].querySelectorAll('tbody tr')[0].children.length, 2);
  assert.equal(tables[2].querySelectorAll('tbody tr')[1].children.length, 2);
  assert.match(c.view.contentDOM.textContent, /\| 未完成 \| 表 \|/);
  const cell = tables[1].querySelectorAll('td .cm-table-cell')[1];
  cell.textContent = '2'; cell.dispatchEvent(new c.window.InputEvent('input', { bubbles: true }));
  assert.equal(c.view.state.doc.toString(), text.replace('行 | 1 |', '行 | 2 |'));
}));

test('edge menus insert rows and columns without altering existing content or alignment', () => editor(c => {
  const text = '前文\n\n| A | B |\n| :--- | ---: |\n| 一 | 二 |\n| 三 | 四 |\n\n後文';
  c.setText(text);
  c.view.contentDOM.querySelectorAll('td .cm-table-cell')[1].focus();
  tableControl(c, 'row', 2).click();
  assert.equal(c.view.state.doc.toString(), text.replace('| 一 | 二 |', '| 一 | 二 |\n|  |  |'));
  assert.equal(c.view.contentDOM.querySelectorAll('tbody tr').length, 3);
  assert.equal(c.document.activeElement === c.view.contentDOM.querySelectorAll('tbody tr')[1].querySelectorAll('.cm-table-cell')[1], true);
  tableControl(c, 'column', 2).click();
  assert.equal(c.view.contentDOM.querySelectorAll('th').length, 3);
  assert.deepEqual([...c.view.contentDOM.querySelectorAll('th')].map(cell => cell.getAttribute('align')), ['left', 'right', null]);
  assert.equal(c.document.activeElement === c.view.contentDOM.querySelectorAll('th .cm-table-cell')[2], true);
  assert.match(c.view.state.doc.toString(), /\| :--- \| ---: \| --- \|/);
  assert.match(c.view.state.doc.toString(), /\| 一 \| 二 \|  \|/);
  assert.ok(c.view.state.doc.toString().startsWith('前文\n\n'));
  assert.ok(c.view.state.doc.toString().endsWith('\n\n後文'));
  inputCell(c, c.document.activeElement, '追加列');
  assert.equal(c.view.contentDOM.querySelectorAll('th')[2].textContent, '追加列');
}));

test('adding a middle column pads short rows and preserves hidden surplus cells', () => editor(c => {
  const text = '| A | B |\n| --- | :---: |\n| 短い行 |\n| 一 | 二 | 余分 |\n\n末尾';
  c.setText(text);
  c.view.contentDOM.querySelector('th .cm-table-cell').focus();
  tableControl(c, 'column', 1).click();
  assert.equal(c.view.state.doc.toString(), '| A |  | B |\n| --- | --- | :---: |\n| 短い行 |  |\n| 一 |  | 二 | 余分 |\n\n末尾');
  inputCell(c, c.view.contentDOM.querySelectorAll('tbody tr')[0].querySelectorAll('.cm-table-cell')[2], '補完');
  assert.match(c.view.state.doc.toString(), /\| 短い行 \|  \| 補完 \|/);
  assert.match(c.view.state.doc.toString(), /\| 一 \|  \| 二 \| 余分 \|/);
}));

test('nested-table additions preserve quote and list prefixes and edge cells can be cleared', () => editor(c => {
  const text = '> A | B\n> --- | ---\n> 一 | 二\n\n後文';
  c.setText(text);
  inputCell(c, c.view.contentDOM.querySelector('th .cm-table-cell'), '');
  assert.equal(c.view.contentDOM.querySelectorAll('th').length, 2);
  assert.match(c.view.state.doc.toString(), /^> \|  \| B/);
  c.view.contentDOM.querySelector('td .cm-table-cell').focus();
  tableControl(c, 'row', 2).click();
  assert.match(c.view.state.doc.toString(), /> 一 \| 二\n> \|  \|  \|/);
  tableControl(c, 'column', 1).click();
  assert.equal(c.view.contentDOM.querySelectorAll('th').length, 3);
  assert.ok(c.view.state.doc.toString().endsWith('\n\n後文'));
}));

test('cell text and paste escape Markdown delimiters and never inject clipboard HTML', () => editor(c => {
  c.setText('| A | B |\n| --- | --- |\n| 値 | 維持 |\n\n末尾');
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell');
  inputCell(c, cell, 'a|b *文字* <img src=x onerror=alert(1)>');
  assert.equal(c.view.contentDOM.querySelectorAll('td').length, 2);
  assert.match(c.view.state.doc.toString(), /a\\\|b \\\*文字\\\* \\<img/);
  const selection = c.window.getSelection(), range = c.document.createRange();
  range.selectNodeContents(cell); selection.removeAllRanges(); selection.addRange(range);
  const paste = new c.window.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(paste, 'clipboardData', { value: { getData: type => type === 'text/plain' ? '一行目\n二行目|末尾' : '<img src=x onerror=alert(1)>' } });
  cell.dispatchEvent(paste);
  assert.match(c.view.state.doc.toString(), /一行目<br>二行目\\\|末尾/);
  assert.equal(Boolean(c.view.contentDOM.querySelector('img[src], script, [onerror]')), false);
  assert.equal(c.view.contentDOM.querySelectorAll('td')[1].textContent, '維持');
}));

test('edge menus can insert before the header and first column and delete individual rows and columns', () => editor(c => {
  c.setText('前\n\n| A | B |\n| :--- | ---: |\n| 一 | 二 |\n| 三 | 四 |\n\n後');
  assert.equal(c.view.contentDOM.querySelector('.cm-table-actions'), null);
  tableControl(c, 'row', 0).click();
  assert.equal(c.view.contentDOM.querySelector('th').textContent, '');
  assert.equal(c.view.contentDOM.querySelector('td').textContent, 'A');
  tableControl(c, 'column', 0).click();
  assert.deepEqual([...c.view.contentDOM.querySelectorAll('th')].map(td => td.textContent), ['', '', '']);
  tableControl(c, 'row', 1, true).click(); // 空の見出しを削除してA/Bを昇格
  tableControl(c, 'column', 1, true).click();
  tableControl(c, 'row', 2, true).click(); // 一/二を削除
  assert.equal(c.view.state.doc.toString(), '前\n\n| A | B |\n| :--- | ---: |\n| 三 | 四 |\n\n後');
  assert.equal(c.view.contentDOM.querySelectorAll('tbody tr').length, 1);
}));

test('deleting a whole table or its last row or column preserves adjacent text and focuses the editor', () => editor(c => {
  const original = '前\n\n| A | B |\n| --- | --- |\n| 一 | 二 |\n\n後';
  c.setText(original);
  deleteWholeTable(c);
  assert.equal(c.view.state.doc.toString(), '前\n\n\n後');
  assert.equal(c.view.hasFocus, true);
  assert.equal(c.view.state.selection.main.head, 3);
  assert.equal(c.view.contentDOM.querySelector('table'), null);
  c.setText('| A |\n| --- |\n| 値 |');
  tableControl(c, 'column', 1, true).click();
  assert.equal(c.view.state.doc.toString(), '');
  c.setText('| A | B |\n| --- | --- |');
  tableControl(c, 'row', 1, true).click();
  assert.equal(c.view.state.doc.toString(), '');
}));

test('dragging rows and columns moves contents and alignment together including the header', () => editor(async c => {
  const original = '前\n\n| A | B | C |\n| :--- | ---: | :---: |\n| **一** | a\\|b | `code` |\n| 三 | 四 | 五 |\n\n後';
  c.setText(original);
  await moveTable(c, 'row', 2, 1);
  assert.equal(c.view.state.doc.toString(), original.replace('| **一** | a\\|b | `code` |\n| 三 | 四 | 五 |', '| 三 | 四 | 五 |\n| **一** | a\\|b | `code` |'));
  await moveTable(c, 'row', 2, 0);
  assert.deepEqual([...c.view.contentDOM.querySelectorAll('th')].map(td => td.textContent), ['一', 'a|b', 'code']);
  await moveTable(c, 'column', 0, 3);
  assert.equal(c.view.state.doc.toString(), '前\n\n| a\\|b | `code` | **一** |\n| ---: | :---: | :--- |\n| B | C | A |\n| 四 | 五 | 三 |\n\n後');
  assert.deepEqual([...c.view.contentDOM.querySelectorAll('th')].map(td => td.getAttribute('align')), ['right', 'center', 'left']);
}));

test('table controls reject external and stale drags and pause during composition', () => editor(async c => {
  const original = '| A | B |\n| --- | --- |\n| 一 | 二 |';
  c.setText(original);
  await measureTable(c);
  const handle = c.view.contentDOM.querySelector('.cm-table-row-handle');
  const rowGap = c.view.contentDOM.querySelector('.cm-table-row-gap[data-boundary="2"]');
  rowGap.dispatchEvent(new c.window.Event('drop', { bubbles: true, cancelable: true }));
  assert.equal(c.view.state.doc.toString(), original);
  pointerEvent(c, handle, 'pointerdown', 25, 50);
  pointerEvent(c, handle, 'pointermove', 100, 110);
  c.setText(original.replace('一', '外部'));
  pointerEvent(c, handle, 'pointerup', 100, 110);
  assert.equal(c.view.state.doc.toString(), original.replace('一', '外部'));
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell');
  cell.focus(); cell.dispatchEvent(new c.window.CompositionEvent('compositionstart', { bubbles: true }));
  for (const button of c.view.contentDOM.querySelectorAll('.cm-table-controls button')) assert.equal(button.disabled, true);
  c.view.contentDOM.querySelector('.cm-table-row-handle').click();
  c.view.contentDOM.querySelector('.cm-table-options').click();
  assert.equal(c.view.contentDOM.querySelector('.cm-table-menu').hidden, true);
  assert.equal(c.view.state.doc.toString(), original.replace('一', '外部'));
  cell.dispatchEvent(new c.window.CompositionEvent('compositionend', { bubbles: true }));
  for (const button of c.view.contentDOM.querySelectorAll('.cm-table-controls button')) assert.equal(button.disabled, false);
}));

test('keyboard handles reorder rows and columns and keep focus on the moved handle', () => editor(c => {
  c.setText('| A | B |\n| --- | ---: |\n| 一 | 二 |\n| 三 | 四 |');
  const key = (axis, index, key) => {
    const handle = c.view.contentDOM.querySelector(`.cm-table-${axis}-handle[data-index="${index}"]`);
    handle.focus(); handle.dispatchEvent(new c.window.KeyboardEvent('keydown', { key, altKey: true, bubbles: true, cancelable: true }));
  };
  key('row', 2, 'ArrowUp');
  assert.match(c.view.state.doc.toString(), /\| 三 \| 四 \|\n\| 一 \| 二 \|$/);
  assert.equal(c.document.activeElement.dataset.index, '1');
  key('column', 0, 'ArrowRight');
  assert.match(c.view.state.doc.toString(), /^\| B \| A \|\n\| ---: \| --- \|/);
  assert.equal(c.document.activeElement.dataset.index, '1');
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell');
  cell.focus(); cell.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement.getAttribute('aria-label'), '1行目を移動');
  c.document.activeElement.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(c.actions, ['undo']);
  c.document.activeElement.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement, cell);
}));

test('hovering a row or its header reveals only that handle and cell focus marks the cell boundary', () => editor(async c => {
  c.setText('| A | B |\n| --- | --- |\n| 一 | 二 |\n| 三 | 四 |');
  const root = await measureTable(c);
  const hovered = () => [...root.querySelectorAll('.cm-table-control-hover')].map(button => [button.dataset.axis, button.dataset.index]);
  assert.deepEqual(hovered(), []);
  pointerEvent(c, root, 'pointermove', 140, 130);
  assert.deepEqual(hovered(), [['row', '2']]);
  pointerEvent(c, root, 'pointermove', 180, 50);
  assert.deepEqual(hovered(), [['column', '1']]);
  root.querySelector('th .cm-table-cell').dispatchEvent(new c.window.MouseEvent('pointerover', { bubbles: true }));
  assert.deepEqual(hovered(), [['column', '0']], '実際の見出しDOMへのホバーで列を選ぶ');
  pointerEvent(c, root, 'pointermove', 180, 15);
  assert.deepEqual(hovered(), [['column', '1']], '見出しから上のハンドルへ移動しても消えない');
  root.dispatchEvent(new c.window.Event('pointerleave'));
  assert.deepEqual(hovered(), []);
  const cells = root.querySelectorAll('td .cm-table-cell');
  cells[0].focus();
  assert.equal(cells[0].parentElement.classList.contains('cm-table-cell-focused'), true);
  assert.equal(c.window.getComputedStyle(cells[0]).outline, 'none');
  cells[1].focus();
  assert.equal(cells[0].parentElement.classList.contains('cm-table-cell-focused'), false);
  assert.equal(cells[1].parentElement.classList.contains('cm-table-cell-focused'), true);
}));

test('table deletion is in options and open edge menus survive pointer leave and reject stale actions', () => editor(c => {
  const original = '| A | B |\n| --- | --- |\n| 一 | 二 |';
  c.setText(original);
  const root = c.view.contentDOM.querySelector('.cm-live-table'), menu = root.querySelector('.cm-table-menu');
  assert.equal(root.querySelector('.cm-table-delete'), null);
  assert.equal(root.querySelector('[aria-label="テーブルを削除"]'), null);
  root.querySelector('.cm-table-options').click();
  assert.equal(menu.hidden, false);
  assert.equal(c.view.state.doc.toString(), original, 'オプションを開くだけでは削除しない');
  root.dispatchEvent(new c.window.Event('pointerleave'));
  assert.equal(menu.hidden, false);
  c.document.body.dispatchEvent(new c.window.MouseEvent('pointerdown', { bubbles: true }));
  assert.equal(menu.hidden, true);
  root.querySelector('.cm-table-column-handle[data-index="0"]').click();
  const stale = menu.querySelector('[data-command="delete"]');
  c.setText(original.replace('一', '外部'));
  assert.equal(menu.hidden, true);
  stale.click();
  assert.equal(c.view.state.doc.toString(), original.replace('一', '外部'));
  root.querySelector('.cm-table-column-handle[data-index="0"]').click();
  menu.querySelector('[data-command="forward"]').click();
  assert.equal(c.view.state.doc.toString(), '| B | A |\n| --- | --- |\n| 二 | 外部 |');
}));

test('keyboard opens and navigates edge menus and Escape returns through the handle to the cell', () => editor(c => {
  c.setText('| A | B |\n| --- | --- |\n| 一 | 二 |\n| 三 | 四 |');
  const root = c.view.contentDOM.querySelector('.cm-live-table'), menu = root.querySelector('.cm-table-menu');
  const cell = root.querySelector('td .cm-table-cell'); cell.focus();
  cell.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'F10', altKey: true, bubbles: true, cancelable: true }));
  const handle = c.document.activeElement;
  assert.equal(handle.classList.contains('cm-table-control-focused'), true);
  handle.click();
  assert.equal(c.document.activeElement.textContent, '上へ移動');
  c.document.activeElement.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement.textContent, '下へ移動');
  c.document.activeElement.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(menu.hidden, true); assert.equal(c.document.activeElement, handle);
  handle.dispatchEvent(new c.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(c.document.activeElement, cell);
  assert.equal(root.querySelector('.cm-table-control-focused'), null);
}));

test('a completed drag does not accidentally open its menu and an explicit click can still open it', () => editor(async c => {
  c.setText('| A | B |\n| --- | --- |\n| 一 | 二 |');
  await moveTable(c, 'column', 0, 2);
  const root = c.view.contentDOM.querySelector('.cm-live-table'), handle = root.querySelector('.cm-table-column-handle[data-index="0"]');
  handle.dispatchEvent(new c.window.MouseEvent('click', { bubbles: true, detail: 1 }));
  assert.equal(root.querySelector('.cm-table-menu').hidden, true);
  handle.click();
  assert.equal(root.querySelector('.cm-table-menu').hidden, false);
}));

test('pointer dragging targets the nearest boundary and cancellation leaves the table untouched', () => editor(async c => {
  c.setText('| A | B |\n| --- | ---: |\n| 一 | 二 |\n| 三 | 四 |');
  const root = c.view.contentDOM.querySelector('.cm-live-table'), table = root.querySelector('table');
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  root.getBoundingClientRect = () => rect(0, 0, 300, 200);
  root.querySelector('.cm-table-scroll').getBoundingClientRect = () => rect(50, 30, 200, 120);
  table.getBoundingClientRect = () => rect(50, 30, 200, 120);
  [...table.rows].forEach((row, index) => { row.getBoundingClientRect = () => rect(50, 30 + index * 40, 200, 40); });
  [...table.rows[0].cells].forEach((cell, index) => { cell.getBoundingClientRect = () => rect(50 + index * 100, 30, 100, 40); });
  // 表の配置は実画面と同じくrequestMeasureの読取・書込フェーズで確定する。
  root.querySelector('.cm-table-scroll').dispatchEvent(new c.window.Event('scroll'));
  await new Promise(resolve => c.window.requestAnimationFrame(resolve));
  const pointer = (handle, type, x, y) => {
    const event = new c.window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 }); handle.dispatchEvent(event);
  };
  const handle = root.querySelector('.cm-table-row-handle[data-index="2"]');
  let captured = false;
  handle.setPointerCapture = () => { captured = true; };
  handle.hasPointerCapture = () => captured;
  handle.releasePointerCapture = () => { captured = false; };
  pointer(handle, 'pointerdown', 25, 130); pointer(handle, 'pointermove', 100, 70);
  assert.equal(root.querySelector('.cm-table-drop-target').dataset.boundary, '1');
  assert.equal(c.window.getComputedStyle(handle).opacity, '1', '移動中は元のハンドルだけ表示する');
  for (const other of root.querySelectorAll('.cm-table-handle'))
    if (other !== handle) assert.equal(c.window.getComputedStyle(other).opacity, '0');
  pointer(handle, 'pointercancel', 100, 70); pointer(handle, 'pointerup', 100, 70);
  root.querySelector('.cm-table-cell').focus();
  assert.equal(c.window.getComputedStyle(handle).opacity, '0', 'セルの編集へ戻るとハンドルを隠す');
  assert.match(c.view.state.doc.toString(), /\| 一 \| 二 \|\n\| 三 \| 四 \|$/);
  pointer(handle, 'pointerdown', 25, 130); pointer(handle, 'pointermove', 100, 70); pointer(handle, 'pointerup', 100, 70);
  assert.match(c.view.state.doc.toString(), /\| 三 \| 四 \|\n\| 一 \| 二 \|$/);
  assert.equal(captured, false);
  assert.equal(root.classList.contains('cm-table-dragging'), false);
}));

test('nested and ragged tables retain prefixes and hidden cells when rows or columns are rearranged', () => editor(async c => {
  c.setText('> A | B\n> --- | ---:\n> 一\n> 三 | 四 | 余分\n\n後');
  await moveTable(c, 'row', 1, 0);
  assert.equal(c.view.contentDOM.querySelectorAll('th').length, 2);
  assert.match(c.view.state.doc.toString(), /^> \|一\| \|\n> --- \| ---:\n> A \| B/);
  await moveTable(c, 'row', 2, 0);
  assert.equal(c.view.contentDOM.querySelectorAll('th').length, 3);
  assert.match(c.view.state.doc.toString(), /^> 三 \| 四 \| 余分\n> \|--- \| ---:\| --- \|/);
  tableControl(c, 'column', 1, true).click();
  assert.equal(c.view.contentDOM.querySelectorAll('th').length, 2);
  assert.ok(c.view.state.doc.toString().endsWith('\n\n後'));
  c.setText('- A | B\n  --- | ---\n  一 | 二\n  三 | 四\n\n後');
  await moveTable(c, 'row', 0, 3);
  assert.equal(c.view.state.doc.toString(), '- 一 | 二\n  --- | ---\n  三 | 四\n  A | B\n\n後');
}));

test('formatting and host shortcuts work inside cells and undo updates retain the table', () => editor(c => {
  const text = '| A | B |\n| --- | --- |\n| 値 | `a\\|b` |\n\n末尾';
  c.setText(text);
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell');
  cell.focus();
  const range = c.document.createRange(); range.selectNodeContents(cell);
  const selection = c.window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  c.format('bold');
  assert.equal(c.view.state.doc.toString(), text.replace('値', '**値**'));
  assert.equal(cell.querySelector('strong').textContent, '値');
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  for (const [key, extra] of [['s', {}], ['z', {}], ['Z', { shiftKey: true }]])
    cell.dispatchEvent(new c.window.KeyboardEvent('keydown', { key, ...mod, ...extra, bubbles: true, cancelable: true }));
  assert.deepEqual(c.actions, ['save', 'undo', 'redo']);
  c.setText(text);
  assert.equal(c.view.contentDOM.querySelector('td .cm-table-cell') === cell, true);
  assert.equal(cell.textContent, '値');
  assert.equal(Boolean(cell.querySelector('strong')), false);
  assert.equal(c.view.contentDOM.querySelectorAll('td')[1].textContent, 'a|b');
}));

test('cancelling composition or focusing a cell does not normalize untouched Markdown', () => editor(c => {
  const text = '| A |\n| --- |\n| __太字__ と _斜体_ |\n\n末尾';
  c.setText(text);
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell');
  cell.focus();
  cell.dispatchEvent(new c.window.CompositionEvent('compositionstart', { bubbles: true }));
  cell.dispatchEvent(new c.window.CompositionEvent('compositionend', { bubbles: true }));
  c.focus();
  assert.equal(c.view.state.doc.toString(), text);
  assert.deepEqual(c.changes, []);
}));

test('clipboard shortcuts reach the Webview host and imported images are inserted in the active cell', () => editor(c => {
  c.setText('| A |\n| --- |\n| 値 |\n\n末尾');
  const cell = c.view.contentDOM.querySelector('td .cm-table-cell'); cell.focus();
  const range = c.document.createRange(); range.selectNodeContents(cell); range.collapse(false);
  const selection = c.window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
  const observed = [];
  c.document.addEventListener('keydown', event => { if (!event.defaultPrevented) observed.push(event.key); });
  for (const key of ['v', 'c', 'x']) cell.dispatchEvent(new c.window.KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true }));
  assert.deepEqual(observed, ['v', 'c', 'x']);
  c.format('image-file', 'assets/test.png');
  assert.match(c.view.state.doc.toString(), /値!\[画像の説明\]\(<assets\/test.png>\)/);
  assert.equal(Boolean(c.view.contentDOM.querySelector('img[src]')), false);
}));

test('typed markup is styled immediately and remote updates do not emit edits', () => editor(c => {
  c.setText('本文\n\n'); c.select(4);
  c.view.dispatch({ changes: { from: 4, insert: '**入力**' }, selection: { anchor: 10 }, userEvent: 'input' });
  assert.equal(c.view.contentDOM.querySelector('.cm-live-strong').textContent, '**入力**');
  assert.equal(c.changes.at(-1), '本文\n\n**入力**');
  c.select(0);
  assert.equal(c.view.contentDOM.querySelector('.cm-live-strong').textContent, '入力');
  c.setText('外部変更\n\n*入力*');
  assert.ok(c.view.contentDOM.querySelector('.cm-live-emphasis'));
  assert.equal(c.changes.length, 1);
  assert.equal(c.view.state.selection.main.head, 0);
}));

test('code, escaped markup and unsafe HTML or URLs remain literal and inert', () => editor(c => {
  const text = '```md\n# 見出しではない\n**太字ではない**\n- [ ] 操作不可\n```\n\n\\*そのまま\\* ![画像](https://example.com/x.png)\n\n<script>alert(1)</script>\n\n[リンク](javascript:alert(1))\n\n末尾';
  c.setText(text); c.select(text.length);
  assert.ok(c.view.contentDOM.querySelectorAll('.cm-live-codeblock').length >= 4);
  assert.equal(Boolean(c.view.contentDOM.querySelector('.cm-live-heading')), false, 'コード内の見出しは装飾しない');
  assert.equal(Boolean(c.view.contentDOM.querySelector('.cm-live-strong')), false, 'コード内の太字は装飾しない');
  assert.equal(Boolean(c.view.contentDOM.querySelector('.cm-live-task')), false, 'コード内のタスクは操作できない');
  assert.equal(Boolean(c.view.contentDOM.querySelector('script, img[src], a, iframe')), false, '入力から実行可能なHTML要素を生成しない');
  assert.match(c.view.contentDOM.textContent, /\*\*太字ではない\*\*/);
  assert.equal(c.view.state.doc.toString(), text);
}));

test('task widgets change only the checkbox character and reveal source when editing', () => editor(c => {
  const text = '- [ ] **タスク**\n- [X] 完了\n\n末尾';
  c.setText(text); c.select(text.length);
  const task = c.view.contentDOM.querySelector('.cm-live-task');
  task.focus(); task.click();
  assert.equal(c.view.state.doc.toString(), text.replace('[ ]', '[x]'));
  assert.equal(c.changes.at(-1), text.replace('[ ]', '[x]'));
  assert.equal(c.document.activeElement, task);
  assert.equal(task.getAttribute('aria-checked'), 'true');
  task.click();
  assert.equal(c.view.state.doc.toString(), text);
  c.select(3);
  assert.match(c.view.contentDOM.textContent, /- \[ \] \*\*タスク\*\*/);
  assert.equal(c.view.contentDOM.querySelectorAll('.cm-live-task').length, 1);
}));

test('composition preserves the DOM of styled input and refreshes after confirmation', () => editor(async c => {
  c.setText('**日本語**\n\n末尾'); c.select(4);
  const strong = c.view.contentDOM.querySelector('.cm-live-strong');
  c.view.contentDOM.dispatchEvent(new c.window.CompositionEvent('compositionstart', { bubbles: true }));
  c.view.dispatch({ changes: { from: 4, insert: '入力' }, selection: { anchor: 6 }, userEvent: 'input.type.compose' });
  assert.equal(c.view.contentDOM.querySelector('.cm-live-strong'), strong);
  assert.equal(c.view.state.doc.toString(), '**日本入力語**\n\n末尾');
  c.view.contentDOM.dispatchEvent(new c.window.CompositionEvent('compositionend', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 30));
  c.select(c.view.state.doc.length);
  assert.equal(c.view.contentDOM.querySelector('.cm-live-strong').textContent, '日本入力語');
}));

test('save and undo/redo keep using host actions and Markdown lists continue with Enter', () => editor(c => {
  c.setText('- 項目'); c.select(c.view.state.doc.length); c.focus();
  const key = (value, extra = {}) => c.view.contentDOM.dispatchEvent(new c.window.KeyboardEvent('keydown', {
    key: value, keyCode: value === 'Enter' ? 13 : value.toUpperCase().charCodeAt(0), bubbles: true, cancelable: true, ...extra,
  }));
  key('Enter');
  assert.equal(c.view.state.doc.toString(), '- 項目\n- ');
  const mod = process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true };
  key('s', mod); key('z', mod); key('Z', { ...mod, shiftKey: true });
  assert.deepEqual(c.actions, ['save', 'undo', 'redo']);
}));
