import { EditorState, EditorSelection, Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, HighlightStyle, bracketMatching } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { searchKeymap, openSearchPanel } from '@codemirror/search';
import { snippet, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { wrapSelection, formatLines } from './formatting';
import { textChange } from '../src/text-change';

export function createEditor(parent, onChange, actions) {
  const palette = new Compartment();
  const highlight = dark => syntaxHighlighting(HighlightStyle.define([
    { tag: tags.keyword, color: dark ? '#c4a4f5' : '#8250df' },
    { tag: [tags.string, tags.url], color: dark ? '#a5d6ff' : '#0a3069' },
    { tag: [tags.number, tags.bool], color: dark ? '#79c0ff' : '#0550ae' },
    { tag: tags.comment, color: dark ? '#a0adbb' : '#57606a', fontStyle: 'italic' },
    { tag: tags.heading, color: dark ? '#8fb5ff' : '#0550ae', fontWeight: 'bold' },
    { tag: tags.strong, fontWeight: 'bold' }, { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: tags.strikethrough, textDecoration: 'line-through' },
  ]));
  const dark = () => document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
  let remote = false;
  const view = new EditorView({ parent, state: EditorState.create({ extensions: [
    EditorView.cspNonce.of(document.querySelector('meta[name="style-nonce"]')?.content || ''),
    lineNumbers(), drawSelection(), highlightActiveLine(), bracketMatching(), closeBrackets(), EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }), palette.of(highlight(dark())),
    Prec.highest(keymap.of([
      { key: 'Mod-s', run: () => { actions.save(); return true; } },
      { key: 'Mod-z', run: () => { actions.undo(); return true; } },
      { key: 'Mod-Shift-z', run: () => { actions.redo(); return true; } },
      { key: 'Mod-y', run: () => { actions.redo(); return true; } },
      { key: 'Mod-b', run: () => { format('bold'); return true; } },
      { key: 'Mod-i', run: () => { format('italic'); return true; } },
    ])), keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, indentWithTab]),
    EditorView.updateListener.of(update => { if (update.docChanged && !remote) onChange(update.state.doc.toString()); }),
    EditorView.contentAttributes.of({ 'aria-label': 'Markdown本文を編集', spellcheck: 'false' }),
  ] }) });
  new MutationObserver(() => view.dispatch({ effects: palette.reconfigure(highlight(dark())) })).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  function setText(text) {
    const delta = textChange(view.state.doc.toString(), text);
    if (!delta) return;
    remote = true;
    try { view.dispatch({ changes: { from: delta.start, to: delta.end, insert: delta.text } }); }
    finally { remote = false; }
  }
  function format(kind, value) {
    if (['bold','italic','underline','strike','inline-code'].includes(kind)) {
      view.dispatch(view.state.changeByRange(range => {
        const formatted = wrapSelection(kind, view.state.sliceDoc(range.from, range.to));
        return { changes: { from: range.from, to: range.to, insert: formatted.text },
          range: EditorSelection.range(range.from + formatted.offset, range.from + formatted.offset + formatted.length) };
      }));
    } else if (['heading','bullet-list','ordered-list','quote'].includes(kind)) {
      if (kind === 'heading' && (!Number.isInteger(value) || value < 1 || value > 7)) return;
      const range = view.state.selection.main;
      const first = view.state.doc.lineAt(range.from);
      const last = view.state.doc.lineAt(range.to > range.from && view.state.doc.lineAt(range.to).from === range.to ? range.to - 1 : range.to);
      const selected = view.state.sliceDoc(first.from,last.to);
      const result = formatLines(kind,selected,value);
      view.dispatch({ changes: { from:first.from,to:last.to,insert:result },
        selection: EditorSelection.range(first.from,first.from+result.length) });
    } else {
      const range = view.state.selection.main;
      const selected = view.state.sliceDoc(range.from, range.to);
      const prefix = view.state.doc.lineAt(range.from).from < range.from ? '\n\n' : '\n';
      const escape = text => text.replace(/[{}]/g, '\\$&');
      let template;
      if (kind === 'code') {
        const fence = '`'.repeat(Math.max(3, ...[...selected.matchAll(/`+/g)].map(match => match[0].length + 1)));
        template = prefix + fence + '${1:text}\n' + (selected ? escape(selected) : '${2:コード}') + '\n' + fence + '\n${0}';
      } else if (kind === 'table') {
        template = prefix + '| ${1:見出し1} | ${2:見出し2} |\n| --- | --- |\n| ${3:内容1} | ${4:内容2} |\n| ${5:内容3} | ${6:内容4} |\n\n${0}';
      } else if (kind === 'horizontal-rule') {
        // Insert a separator without deleting selected prose.
        const pos=range.to;
        view.dispatch({changes:{from:pos,insert:'\n\n---\n\n'},selection:{anchor:pos+7}});
        view.focus(); return;
      } else if (kind === 'link' || kind === 'image-url') {
        const label=selected ? escape(selected.replace(/([\[\]\\])/g,'\\$1')) : '${1:'+(kind==='link'?'リンクテキスト':'画像の説明')+'}';
        template=(kind==='image-url'?'!':'')+'['+label+'](${2:https://example.com/})${0}';
      } else if (kind === 'image-file') {
        const label=selected ? selected.replace(/([\[\]\\])/g,'\\$1') : '画像の説明';
        // Local path comes from the host's file picker; braces remain literal.
        template='!['+escape(label)+']('+escape(value)+')${0}';
      } else return;
      snippet(template)(view, null, range.from, range.to);
    }
    view.focus();
  }

  return { view, setText, format, focus: () => view.focus(), find: () => openSearchPanel(view) };
}
