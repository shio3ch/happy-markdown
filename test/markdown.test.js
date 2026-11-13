'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { renderMarkdown, taskEdit } = require('../src/markdown');

test('maps nested, quoted and ordered tasks to exact source characters', () => {
  const source = '- [ ] outer\r\n  - [X] nested\r\n> 1. [ ] quoted\r\n\r\n- regular';
  const { html, tasks } = renderMarkdown(source);
  assert.equal(tasks.size, 3);
  for (const task of tasks.values()) {
    assert.match(task.expected.slice(task.character - 1, task.character + 2), /^\[[ xX]\]$/);
  }
  assert.equal(tasks.get('1').checked, true);
  assert.match(html, /data-task="2"/);
});

test('does not treat code, prose or escaped markers as editable tasks', () => {
  const source = '```md\n- [ ] code\n```\n\n    - [ ] indented code\n\n[ ] prose\n\n- \\[ ] escaped\n\n- `[ ]` inline code';
  assert.equal(renderMarkdown(source).tasks.size, 0);
});

test('edits only the checkbox character and rejects stale or forged requests', () => {
  const source = '- [ ] **review**';
  const { tasks } = renderMarkdown(source);
  const request = { type: 'toggle', id: '0', checked: true, version: 3 };
  const edit = taskEdit(tasks, request, 3, () => source);
  assert.equal(source.slice(0, edit.character) + edit.text + source.slice(edit.character + 1), '- [x] **review**');
  assert.equal(taskEdit(tasks, request, 4, () => source), undefined);
  assert.equal(taskEdit(tasks, request, 3, () => '- [ ] different'), undefined);
  assert.equal(taskEdit(tasks, { ...request, id: '20' }, 3, () => source), undefined);
  assert.equal(taskEdit(tasks, { ...request, checked: 'yes' }, 3, () => source), undefined);
  assert.equal(taskEdit(tasks, { ...request, checked: false }, 3, () => source), undefined);
});

test('supports unchecking uppercase X and preserves task formatting', () => {
  const source = '> - [X] 完了';
  const { tasks } = renderMarkdown(source);
  const edit = taskEdit(tasks, { type: 'toggle', id: '0', checked: false, version: 1 }, 1, () => source);
  assert.equal(edit.text, ' ');
  assert.equal(edit.character, 5);
});

test('keeps details and anchors but removes scripts, event handlers and command links', () => {
  const { html } = renderMarkdown('# 日本語の見出し\n\n<details open><summary>補足</summary>本文</details>\n\n<script>alert(1)</script>\n<img src="https://example.com/a.png" onerror="alert(1)">\n<a href="command:evil">bad</a>');
  assert.match(html, /id="日本語の見出し"/);
  assert.match(html, /<details open>/);
  assert.doesNotMatch(html, /<script|onerror|command:/);
});

test('escapes task labels and disables raw HTML checkboxes', () => {
  const { html } = renderMarkdown('- [ ] "quoted" & <strong>bold</strong>\n\n<input type="checkbox">');
  assert.match(html, /aria-label="&quot;quoted&quot; &amp;/);
  assert.match(html, /disabled/);
});

test('highlights language fences and aliases while preserving code after sanitization', () => {
  for (const language of ['javascript', 'js', 'typescript', 'TS']) {
    const { html } = renderMarkdown('```' + language + '\nconst greeting = "hello";\n```');
    assert.match(html, /class="hljs-keyword">const<\/span>/);
    assert.match(html, /class="hljs-string">"hello"<\/span>/);
  }
  const { html } = renderMarkdown('```json\n{"enabled": true, "count": 42}\n```');
  assert.match(html, /hljs-attr/);
  assert.match(html, /hljs-number/);
});

test('unknown and unspecified languages remain escaped plain text', () => {
  for (const language of ['', 'not-a-real-language', 'text']) {
    const { html } = renderMarkdown('```' + language + '\n<script>alert("x")</script>\n- [ ] code\n```');
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script|hljs-|data-task/);
  }
});

test('HTML code is highlighted as text, never active markup', () => {
  const { html, tasks } = renderMarkdown('```html\n<img src="x" onerror="alert(1)">\n<input type="checkbox">\n```');
  assert.match(html, /hljs-tag/);
  assert.doesNotMatch(html, /<img|<input/);
  assert.equal(tasks.size, 0);
});
