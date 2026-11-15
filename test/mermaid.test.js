'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { shell } = require('../dist/src/shell');
const { renderMarkdown } = require('../dist/src/markdown');
const { webview } = require('./webview-helper');
const { JSDOM } = require('jsdom');
const { mermaidSvg } = require('../dist/webview/mermaid-view');

async function waitFor(predicate) {
  const until = Date.now() + 15000;
  while (!predicate()) {
    if (Date.now() > until) assert.fail('Mermaidの更新が完了しませんでした。');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
const snapshot = (text, version = 1) => ({ type: 'snapshot', text, version, html: renderMarkdown(text).html, dirty: false });
const client = mode => webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path), { mode });
const svg = element => element.shadowRoot.querySelector('svg');

test('SVG sanitization removes executable markup, remote resources and unsafe CSS while keeping local markers', async () => {
  const dom = new JSDOM('<!doctype html><meta name="style-nonce" content="trusted">');
  try {
    const fragment = await mermaidSvg(`<svg xmlns="http://www.w3.org/2000/svg">
      <script>alert(1)</script><foreignObject><p>HTML</p></foreignObject>
      <image href="https://example.com/image.svg"/><a href="javascript:alert(1)"><text>label</text></a>
      <animate attributeName="href" values="javascript:alert(1)"/>
      <style>@import url(https://example.com/a.css); rect{fill:red;stroke:url(https://example.com/remote);background-image:image-set('https://example.com/x');position:fixed} path{marker-end:url(#arrow);stroke:blue}</style>
      <rect onclick="alert(1)" fill="url(https://example.com/a)" style="fill:red;stroke:url(https://example.com/b);position:fixed"/>
      <path marker-end="url(#arrow)"/>
    </svg>`, dom.window.document);
    assert.equal(fragment.querySelector('script,foreignObject,image,a,animate,[onclick],[href]'), null);
    assert.equal(fragment.querySelector('rect').getAttribute('fill'), null);
    assert.equal(fragment.querySelector('rect').style.fill, 'red');
    assert.equal(fragment.querySelector('rect').style.stroke, '');
    assert.equal(fragment.querySelector('rect').style.position, '');
    assert.equal(fragment.querySelector('path').getAttribute('marker-end'), 'url(#arrow)');
    assert.doesNotMatch(fragment.querySelector('style').textContent, /https|@import|position|image-set/);
    assert.match(fragment.querySelector('style').textContent, /marker-end:url\(#arrow\)/);
    assert.equal(fragment.querySelector('style').getAttribute('nonce'), 'trusted');
  } finally { dom.window.close(); }
});

test('Mermaid renders flowcharts and sequences, isolates styles, updates themes and retains source on errors', async () => {
  const c = await client('preview');
  try {
    const text = '```mermaid\nflowchart LR\n A[開始] --> B[終了]\n```\n\n```mermaid\nsequenceDiagram\n Alice->>Bob: こんにちは\n```';
    await c.receive(snapshot(text));
    await waitFor(() => [...c.document.querySelectorAll('#document .mermaid-diagram')].every(node => node.dataset.state !== 'loading'));
    const diagrams = [...c.document.querySelectorAll('#document .mermaid-diagram')];
    assert.equal(diagrams.length, 2);
    for (const diagram of diagrams) {
      assert.equal(diagram.dataset.state, 'ready', diagram.shadowRoot.textContent);
      assert.ok(svg(diagram));
      assert.equal(svg(diagram).querySelector('style').getAttribute('nonce'), c.document.querySelector('meta[name="style-nonce"]').content);
      assert.equal(diagram.previousElementSibling.hidden, true);
    }
    const originalSvg = svg(diagrams[0]);
    c.document.body.classList.add('vscode-dark');
    await waitFor(() => diagrams[0].dataset.state === 'ready' && svg(diagrams[0]) !== originalSvg);
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
    await c.receive(snapshot('```mermaid\ninvalid syntax\n```\n\n通常の本文', 2));
    await waitFor(() => c.document.querySelector('#document .mermaid-diagram').dataset.state === 'error');
    assert.equal(c.document.querySelector('#document pre').hidden, false);
    assert.match(c.document.querySelector('#document code').textContent, /invalid syntax/);
    assert.match(c.document.querySelector('#document').textContent, /通常の本文/);
    assert.equal(c.document.querySelector('.mermaid-measure'), null);
  } finally { await c.dispose(); }
});

test('live Mermaid switches to source for keyboard editing and returns to a diagram without changing text', async () => {
  const c = await client('edit');
  try {
    const text = '前の文章\n\n```mermaid\nflowchart LR\n A --> B\n```\n\n後の文章';
    await c.receive(snapshot(text));
    await waitFor(() => c.document.querySelector('.cm-live-mermaid .mermaid-diagram')?.dataset.state === 'ready');
    const button = c.document.querySelector('[aria-label="Mermaidの記法を編集"]');
    button.focus(); button.click();
    await waitFor(() => !c.document.querySelector('.cm-live-mermaid'));
    assert.match(c.document.querySelector('.cm-content').textContent, /flowchart LR/);
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
    c.document.getElementById('mode').click();
    await waitFor(() => c.document.querySelector('#document .mermaid-diagram')?.dataset.state === 'ready');
    c.document.getElementById('mode').click();
    assert.equal(c.document.querySelector('.cm-live-mermaid'), null);
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
  } finally { await c.dispose(); }
});

test('new snapshots cancel old Mermaid renders and document configuration cannot weaken security', async () => {
  const c = await client('preview');
  try {
    await c.receive(snapshot('```mermaid\nflowchart LR\n OLD --> RESULT\n```'));
    const text = '```mermaid\n%%{init: {"securityLevel":"loose", "themeCSS":"body{display:none}", "flowchart":{"htmlLabels":true}}}%%\nflowchart LR\n A[新しい図] --> B\n click A "https://example.com/"\n```';
    await c.receive(snapshot(text, 2));
    await waitFor(() => c.document.querySelector('#document .mermaid-diagram')?.dataset.state !== 'loading');
    const diagram = c.document.querySelector('#document .mermaid-diagram');
    assert.equal(diagram.dataset.state, 'ready', diagram.shadowRoot.textContent);
    assert.match(svg(diagram).textContent, /新しい図/);
    assert.doesNotMatch(svg(diagram).textContent, /OLD|body\{display:none\}/);
    assert.equal(svg(diagram).querySelector('a, image, foreignObject, script, [onclick]'), null);
    assert.equal(c.document.querySelectorAll('#document .mermaid-diagram').length, 1);
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
  } finally { await c.dispose(); }
});
