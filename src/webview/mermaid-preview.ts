import { StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import { tableComposition } from './table-preview';
import { renderMermaid } from './mermaid-view';

const disposers = new WeakMap<HTMLElement, () => void>();
class MermaidWidget extends WidgetType {
  constructor(readonly source: string) { super(); }
  eq(other: MermaidWidget) { return this.source === other.source; }
  toDOM(view: EditorView) {
    const root = document.createElement('div');
    root.className = 'cm-live-mermaid';
    const diagram = document.createElement('div');
    diagram.className = 'mermaid-diagram';
    const edit = document.createElement('button');
    edit.type = 'button'; edit.textContent = '記法を編集';
    edit.setAttribute('aria-label', 'Mermaidの記法を編集');
    edit.addEventListener('mousedown', event => event.preventDefault());
    edit.addEventListener('click', () => {
      if (view.compositionStarted) return;
      const from = view.posAtDOM(root);
      view.dispatch({ selection: { anchor: view.state.doc.lineAt(from).to + 1 }, scrollIntoView: true });
      view.focus();
    });
    root.append(edit, diagram);
    disposers.set(root, renderMermaid(diagram, this.source, undefined, () => view.requestMeasure()));
    return root;
  }
  destroy(root: HTMLElement) { disposers.get(root)?.(); disposers.delete(root); }
  ignoreEvent() { return true; }
}

function diagrams(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({ enter(ref) {
    if (ref.name !== 'FencedCode') return;
    const { from, to } = ref;
    const info = ref.node.getChild('CodeInfo');
    if (!info || state.sliceDoc(info.from, info.to).trim().split(/\s+/)[0].toLowerCase() !== 'mermaid') return false;
    // 未閉鎖のフェンスと、編集中・選択中の図はコードのまま保つ。
    const marks = ref.node.getChildren('CodeMark');
    if (marks.length < 2 || state.selection.ranges.some(range => range.from <= to && range.to >= from)) return false;
    // 引用・リストの接頭辞を図の定義に混ぜず、トップレベルだけを置換する。
    if (ref.node.parent?.name !== 'Document') return false;
    const body = state.sliceDoc(state.doc.lineAt(from).to + 1, state.doc.lineAt(marks[marks.length - 1].from).from);
    ranges.push(Decoration.replace({ widget: new MermaidWidget(body), block: true }).range(from, to));
    return false;
  } });
  return Decoration.set(ranges, true);
}

// 複数行を置換する図はStateFieldから供給し、本文とUndo履歴には触れない。
export const mermaidPreview = StateField.define<{ decorations: DecorationSet; composing: boolean }>({
  create: state => ({ decorations: diagrams(state), composing: false }),
  update(value, transaction) {
    let composing = value.composing;
    for (const effect of transaction.effects) if (effect.is(tableComposition)) composing = effect.value;
    if (composing) return { decorations: value.decorations.map(transaction.changes), composing };
    if (value.composing || transaction.docChanged || transaction.selection || syntaxTree(transaction.startState) !== syntaxTree(transaction.state))
      return { decorations: diagrams(transaction.state), composing };
    return value;
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});
