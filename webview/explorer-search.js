'use strict';
const vscode = acquireVsCodeApi();
const query = document.getElementById('query');
const results = document.getElementById('results');
const status = document.getElementById('status');
let revision = 0, composing = false, initialized = false;
function search() {
  if (composing) return;
  revision++;
  results.replaceChildren();
  status.textContent = query.value ? '検索中…' : '検索語を入力してください。';
  vscode.postMessage({ type: 'query', value: query.value, requestId: revision });
}
query.addEventListener('compositionstart', () => { composing = true; });
query.addEventListener('compositionend', () => { composing = false; search(); });
query.addEventListener('input', search);
document.getElementById('clear').addEventListener('click', () => { query.value = ''; search(); query.focus(); });
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(type, id) { vscode.postMessage({ type, id }); }
function excerpt(match, term) {
  const row = element('span', 'excerpt');
  row.append(element('span', 'line-number', `${match.line}`));
  const text = element('span');
  const offset = match.text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  if (offset < 0 || !term) text.textContent = match.text;
  else text.append(document.createTextNode(match.text.slice(0, offset)), element('mark', '', match.text.slice(offset, offset + term.length)), document.createTextNode(match.text.slice(offset + term.length)));
  row.append(text);
  return row;
}
window.addEventListener('message', event => {
  const state = event.data;
  if (state?.type !== 'state' || !Array.isArray(state.results)) return;
  if (initialized && (state.requestId < revision || state.query !== query.value)) return;
  if (!initialized) { query.value = state.query; revision = state.requestId; initialized = true; query.disabled = false; }
  status.textContent = state.status;
  results.setAttribute('aria-busy', String(state.busy));
  // Preserve a focused result action across bookmark/active-document updates.
  const focused = document.activeElement?.dataset;
  const fragment = document.createDocumentFragment();
  for (const result of state.results) {
    const card = element('article', `result${result.active ? ' active' : ''}`);
    const open = element('button', 'open-result');
    open.type = 'button'; open.dataset.id = result.id; open.dataset.action = 'open';
    open.title = result.path;
    const heading = element('span', 'result-heading');
    heading.append(element('span', 'document-icon', result.bookmarked ? '▣' : '▤'), element('strong', '', result.label), element('span', 'count', `${result.count}行`));
    if (result.active) heading.append(element('span', 'active-label', '表示中'));
    open.append(heading, element('span', 'path', result.path));
    for (const match of result.matches) open.append(excerpt(match, state.query));
    open.addEventListener('click', () => action('open', result.id));
    const actions = element('div', 'result-actions');
    for (const [type, label] of [['bookmark', result.bookmarked ? 'ブックマーク解除' : 'ブックマークに追加'], ['source', 'ソースを開く']]) {
      const button = element('button', '', label);
      button.type = 'button'; button.dataset.id = result.id; button.dataset.action = type;
      if (type === 'bookmark') button.setAttribute('aria-pressed', String(result.bookmarked));
      button.addEventListener('click', () => action(type, result.id));
      actions.append(button);
    }
    card.append(open, actions); fragment.append(card);
  }
  results.replaceChildren(fragment);
  if (focused?.id) for (const button of results.querySelectorAll('button')) {
    if (button.dataset.id === focused.id && button.dataset.action === focused.action) { button.focus({ preventScroll: true }); break; }
  }
});
vscode.postMessage({ type: 'ready' });
