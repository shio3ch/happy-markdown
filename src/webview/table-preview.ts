import { Facet, Prec, StateEffect, StateField } from '@codemirror/state';
import type { EditorState, Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType, keymap } from '@codemirror/view';
import type { DecorationSet } from '@codemirror/view';
import type { SourceRow, TableModel } from './table-model';
import { focusTableAt, inputTableAt, TableView, updateTable, destroyTable } from './table-view';
import type { TableActions } from './table-view';

export const tableComposition = StateEffect.define<boolean>();
const actions = Facet.define<TableActions, TableActions>({ combine: values => values[0] || { save() {}, undo() {}, redo() {} } });

class TableWidget extends WidgetType {
  constructor(readonly model: TableModel, readonly actions: TableActions) { super(); }
  eq(other: TableWidget) { return this.model.from === other.model.from && this.model.to === other.model.to && this.model.source === other.model.source; }
  toDOM(view: EditorView) { return new TableView(view, this.model, this.actions).root; }
  updateDOM(root: HTMLElement) { return updateTable(root, this.model); }
  destroy(root: HTMLElement) { destroyTable(root); }
  ignoreEvent() { return true; }
}

function tables(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  syntaxTree(state).iterate({ enter(ref) {
    if (ref.name === 'FencedCode' || ref.name === 'CodeBlock' || ref.name === 'HTMLBlock') return false;
    if (ref.name !== 'Table') return;
    const { from, to } = ref;
    const rows: SourceRow[] = [];
    for (let child = ref.node.firstChild; child; child = child.nextSibling)
      if (['TableHeader', 'TableDelimiter', 'TableRow'].includes(child.name)) rows.push({ text: state.sliceDoc(child.from, child.to), from: child.from });
    const model = { from, to, source: state.sliceDoc(from, to), rows };
    ranges.push(Decoration.replace({ widget: new TableWidget(model, state.facet(actions)), block: true }).range(from, to));
    return false;
  } });
  return Decoration.set(ranges, true);
}

// 改行を置換するブロック装飾は、表示範囲に依存せずStateFieldから直接供給する。
const tableState = StateField.define<{ decorations: DecorationSet; composing: boolean }>({
  create: state => ({ decorations: tables(state), composing: false }),
  update(value, transaction) {
    let composing = value.composing;
    for (const effect of transaction.effects) if (effect.is(tableComposition)) composing = effect.value;
    if (composing) return { decorations: value.decorations.map(transaction.changes), composing };
    if (value.composing || transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(transaction.state))
      return { decorations: tables(transaction.state), composing };
    return value;
  },
  provide: field => [EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).decorations)],
});

export function tablePreview(callbacks: TableActions) {
  return [actions.of(callbacks), tableState,
    EditorView.inputHandler.of((view, from, to, text) => from === to && inputTableAt(view, from, text)),
    Prec.highest(keymap.of(['Enter', 'Tab', 'Backspace', 'Delete'].map(key => ({ key, run: view => {
      const range = view.state.selection.main;
      return range.empty && focusTableAt(view, range.head);
    } })))),
  ];
}
