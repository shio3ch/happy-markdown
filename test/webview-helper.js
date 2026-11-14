'use strict';
const fs = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const assert = require('node:assert/strict');

async function waitFor(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) assert.fail('Webviewの更新が完了しませんでした。');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function webview(name, html, restored) {
  const errors = [], sent = [], persisted = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  console.on('error', (...values) => errors.push(values));
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://webview.test/', virtualConsole: console });
  const { window } = dom;
  // jsdomには描画エンジンがないため、CodeMirrorが計測するAPIのみを補う。
  window.Range.prototype.getClientRects = () => [];
  window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.acquireVsCodeApi = () => ({ getState: () => restored, setState: value => persisted.push(value), postMessage: value => sent.push(value) });
  window.eval(fs.readFileSync(require.resolve(`../dist/${name}.js`), 'utf8'));
  await waitFor(() => sent.some(message => message.type === 'ready'));
  return { window, document: window.document, sent, persisted, errors,
    async receive(data) { window.dispatchEvent(new window.MessageEvent('message', { data })); await new Promise(resolve => setTimeout(resolve, 5)); },
    async input(element, value) {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(element, value);
      element.dispatchEvent(new window.Event('input', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 5));
    },
    async dispose() {
      window.dispatchEvent(new window.Event('pagehide'));
      await new Promise(resolve => setTimeout(resolve, 5));
      dom.window.close();
      assert.deepEqual(errors, [], 'Webviewに実行時エラーがありません。');
    },
  };
}
module.exports = { webview, waitFor };
