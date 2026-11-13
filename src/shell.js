'use strict';
const { randomBytes } = require('node:crypto');
const paths = {
  save: '<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
  undo: '<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12"/>',
  redo: '<path d="m16 4 5 5-5 5m5-5H10a6 6 0 0 0 0 12"/>',
  inline: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',
  bullet: '<path d="M9 5h12M9 12h12M9 19h12"/><circle cx="3" cy="5" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="19" r="1"/>',
  ordered: '<path d="M10 5h11M10 12h11M10 19h11M2 3h2v6M2 9h4m-4 5c0-3 4-3 4 0 0 2-4 3-4 6h4"/>',
  quote: '<path d="M4 6h6v7H5c0 3 2 4 4 5M14 6h6v7h-5c0 3 2 4 4 5"/>',
  hr: '<path d="M3 12h18"/>',
  link: '<path d="m10 13 4-4m-7 6-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0" transform="translate(2 0)"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 18 6-6 4 4 3-3 5 5"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  code: '<path d="M7 3H3v18h4m10-18h4v18h-4M10 8l-4 4 4 4m4-8 4 4-4 4"/>',
  pencil: '<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4"/>',
};
function icon(name) { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`; }
function button(id, title, content) { return `<button id="${id}" class="tool-button" type="button" title="${title}" aria-label="${title}">${content}</button>`; }
function shell(webview, resource) {
  const nonce = randomBytes(16).toString('hex');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="style-nonce" content="${nonce}">
  <link rel="stylesheet" href="${resource('styles/preview.css')}"><link rel="stylesheet" href="${resource('styles/workbench.css')}">
  </head><body class="design-preview workbench">
  <header class="workbench-toolbar" aria-label="Markdownツールバー">
    <div id="toolbar-start">${button('save','保存（Ctrl+S）',icon('save'))}
    <span id="edit-actions" hidden>
      ${button('undo','元に戻す（Ctrl+Z）',icon('undo'))}${button('redo','やり直す（Ctrl+Shift+Z）',icon('redo'))}
      <div class="tool-dropdown" id="heading-menu"><button id="heading" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="heading-options" title="見出しレベルを選択">見出し ▾</button>
        <div class="tool-options" id="heading-options" hidden aria-label="見出しレベル">${Array.from({length:7},(_,i)=>`<button type="button" data-heading="${i+1}" title="${i===6?'見出し7（専用画面の拡張記法）':'見出し'+(i+1)}"><strong>H${i+1}</strong> 見出し ${i+1}${i===6?' <small>拡張</small>':''}</button>`).join('')}</div>
      </div>
      ${button('bold','太字','<b>B</b>')}${button('italic','斜体','<i>I</i>')}${button('underline','下線','<u>U</u>')}${button('strike','取り消し線','<s>S</s>')}
      ${button('inline-code','インラインコード',icon('inline'))}
      ${button('bullet-list','箇条書きリスト',icon('bullet'))}${button('ordered-list','番号付きリスト',icon('ordered'))}
      ${button('quote','引用',icon('quote'))}${button('horizontal-rule','水平線',icon('hr'))}${button('link','リンク',icon('link'))}
      <div class="tool-dropdown" id="image-menu"><button id="image" class="tool-button" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="image-options" title="画像を追加" aria-label="画像を追加">${icon('image')}</button>
        <div class="tool-options" id="image-options" hidden aria-label="画像の追加方法"><button type="button" id="image-file">ファイルから追加</button><button type="button" id="image-url">URLを入力</button></div>
      </div>
      ${button('table','テーブル',icon('table'))}${button('code','コードスニペット',icon('code'))}
    </span>
    <div id="preview-info"><span id="progress" role="status"></span>
      <div class="tool-dropdown" id="toc-menu"><button id="toc" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="toc-options" title="見出しの目次を表示">目次 ▾</button>
        <nav class="tool-options" id="toc-options" hidden aria-label="文書の目次"></nav>
      </div>
    </div></div>
    <div class="document-search" role="search"><svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input id="search" type="search" placeholder="本文を検索" aria-label="本文を検索"><span id="search-count" role="status"></span><button id="search-prev" aria-label="前の一致">↑</button><button id="search-next" aria-label="次の一致">↓</button></div>
    <button id="mode" title="編集とプレビューを切り替え" aria-pressed="false">${icon('pencil')}<span id="mode-label">編集する</span></button>
  </header>
  <section id="conflict" role="alert" hidden><span>別の場所で文書が更新されたか、変更を反映できませんでした。入力中の内容は保持しています。</span><button id="use-latest">最新の文書を読み込む</button><button id="use-draft">入力中の内容を反映</button></section>
  <div id="editor" hidden aria-label="Markdownテキストエディター"></div>
  <main id="document" aria-label="Markdownプレビュー"></main><p id="message" role="status"></p>
  <script nonce="${nonce}" src="${resource('dist/workbench.js')}"></script></body></html>`;
}
module.exports = { shell };
