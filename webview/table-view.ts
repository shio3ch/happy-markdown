import type { ChangeSpec } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Format } from './formatting';
import { addColumn, addRowAt, cells, deleteColumn, deleteRow, deleteTable, editCell, moveColumn, moveRow } from './table-model';
import type { TableModel } from './table-model';
import { formatCell, insertCellImage, insertCellText, renderCell, serializeCell } from './table-cell';
import { TableControls } from './table-controls';

export interface TableActions { save(): void; undo(): void; redo(): void }
interface CellView { element: HTMLDivElement; markdown: string; serialized: string; composing: boolean }
const roots = new WeakMap<HTMLElement, TableView>();
const active = new WeakMap<EditorView, TableView>();
const tables = new WeakMap<EditorView, Set<TableView>>();

export function focusTableAt(view: EditorView, position: number): boolean {
  for (const table of tables.get(view) || []) if (table.contains(position)) { table.focusAt(position); return true; }
  return false;
}
export function inputTableAt(view: EditorView, position: number, text: string): boolean {
  for (const table of tables.get(view) || []) if (table.contains(position)) { table.focusAt(position); table.insertText(text); return true; }
  return false;
}
export function destroyTable(root: HTMLElement) {
  const table = roots.get(root);
  if (table) table.destroy();
  roots.delete(root);
}

export function formatActiveTable(view: EditorView, kind: Format, value?: number | string): boolean {
  const table = active.get(view);
  if (!table || !(table.root.contains(document.activeElement) || table.root.contains(window.getSelection()?.anchorNode || null))) return false;
  table.format(kind, value); return true;
}

export function updateTable(root: HTMLElement, model: TableModel): boolean {
  const table = roots.get(root);
  if (!table) return false;
  table.update(model); return true;
}

export class TableView {
  readonly root = document.createElement('div');
  private readonly table = document.createElement('table');
  private readonly controls: TableControls;
  private cellViews: CellView[][] = [];
  private current = { row: 0, column: 0 };
  private writing = false;

  constructor(private readonly view: EditorView, private model: TableModel, private readonly actions: TableActions) {
    roots.set(this.root, this);
    const views = tables.get(view) || new Set<TableView>(); views.add(this); tables.set(view, views);
    this.root.className = 'cm-live-table'; this.root.setAttribute('contenteditable', 'false');
    const scroll = document.createElement('div'); scroll.className = 'cm-table-scroll';
    this.table.setAttribute('aria-label', '編集可能なMarkdownテーブル');
    scroll.append(this.table); this.root.append(scroll);
    this.controls = new TableControls(view, this.root, scroll, this.table, {
      add: (axis, boundary) => this.changeStructure(axis === 'row'
        ? addRowAt(view.state, this.model, boundary) : addColumn(this.model, boundary - 1),
        axis === 'row' ? boundary : 0, axis === 'column' ? boundary : this.current.column),
      remove: (axis, index) => {
        const removesTable = axis === 'row' ? this.cellViews.length === 1 : this.cellViews[0].length === 1;
        if (removesTable) this.removeTable();
        else this.changeStructure(axis === 'row' ? deleteRow(view.state, this.model, index) : deleteColumn(view.state, this.model, index),
          axis === 'row' ? index : this.current.row, axis === 'column' ? index : this.current.column);
      },
      move: (axis, index, boundary) => this.changeStructure(axis === 'row'
        ? moveRow(view.state, this.model, index, boundary) : moveColumn(this.model, index, boundary),
        axis === 'row' ? boundary > index ? boundary - 1 : boundary : this.current.row,
        axis === 'column' ? boundary > index ? boundary - 1 : boundary : this.current.column),
      delete: () => this.removeTable(),
      focusCell: () => this.focusCell(this.current.row, this.current.column),
      command: command => this.actions[command](),
    });
    this.update(model);
  }

  update(model: TableModel) {
    this.model = model;
    const sourceRows = model.rows.filter((_, index) => index !== 1);
    const columns = cells(sourceRows[0]).length;
    const alignments = cells(model.rows[1]).map(cell => cell.text.startsWith(':') ? cell.text.endsWith(':') ? 'center' : 'left' : cell.text.endsWith(':') ? 'right' : '');
    const focused = this.root.contains(document.activeElement);
    if (this.cellViews.length !== sourceRows.length || this.cellViews[0]?.length !== columns) {
      this.table.replaceChildren(); this.cellViews = [];
      const head = document.createElement('thead'), body = document.createElement('tbody');
      this.table.append(head, body);
      sourceRows.forEach((source, row) => {
        const tr = document.createElement('tr'); (row === 0 ? head : body).append(tr);
        const parts = cells(source);
        this.cellViews.push(Array.from({ length: columns }, (_, column) => {
          const td = document.createElement(row === 0 ? 'th' : 'td');
          if (row === 0) td.setAttribute('scope', 'col');
          if (alignments[column]) td.setAttribute('align', alignments[column]);
          const cell: CellView = { element: document.createElement('div'), markdown: parts[column]?.text || '', serialized: '', composing: false };
          cell.element.className = 'cm-table-cell'; cell.element.setAttribute('contenteditable', 'true'); cell.element.tabIndex = 0;
          cell.element.setAttribute('role', 'textbox'); cell.element.setAttribute('aria-multiline', 'true');
          cell.element.setAttribute('aria-label', `${row === 0 ? '見出し' : row + '行目'}、${column + 1}列目`);
          renderCell(cell.element, cell.markdown);
          cell.serialized = serializeCell(cell.element);
          this.connect(cell, row, column); td.append(cell.element); tr.append(td); return cell;
        }));
      });
      if (focused) this.focusCell(Math.min(this.current.row, sourceRows.length - 1), Math.min(this.current.column, columns - 1));
    } else {
      sourceRows.forEach((source, row) => {
        const parts = cells(source);
        this.cellViews[row].forEach((cell, column) => {
          const td = cell.element.parentElement!;
          if (alignments[column]) td.setAttribute('align', alignments[column]); else td.removeAttribute('align');
          const value = parts[column]?.text || '';
          if (value === cell.markdown || cell.composing) return;
          cell.markdown = value;
          // 自分の入力は同じDOMを維持。ホストのUndo / Redo・外部更新だけを描画する。
          const focusedCell = document.activeElement === cell.element;
          renderCell(cell.element, value);
          cell.serialized = serializeCell(cell.element);
          if (focusedCell) this.placeCaret(cell.element);
        });
      });
    }
    this.controls.update(sourceRows.length, columns, model.source);
  }

  private connect(cell: CellView, row: number, column: number) {
    const element = cell.element;
    element.addEventListener('focus', () => { this.current = { row, column }; active.set(this.view, this); element.parentElement?.classList.add('cm-table-cell-focused'); });
    element.addEventListener('blur', () => element.parentElement?.classList.remove('cm-table-cell-focused'));
    element.addEventListener('input', event => { event.stopPropagation(); this.commit(cell, row, column); });
    element.addEventListener('compositionstart', event => {
      event.stopPropagation(); cell.composing = true; this.controls.setDisabled(true);
    });
    element.addEventListener('compositionend', event => {
      event.stopPropagation(); cell.composing = false; this.controls.setDisabled(false);
      this.commit(cell, row, column); this.update(this.model);
    });
    element.addEventListener('beforeinput', event => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault(); this.actions[event.inputType === 'historyUndo' ? 'undo' : 'redo']();
      }
      if (event.inputType === 'insertFromPaste' || event.inputType === 'insertFromDrop') {
        event.preventDefault(); insertCellText(element, event.dataTransfer?.getData('text/plain') || event.data || ''); this.commit(cell, row, column);
      }
    });
    const paste = (event: ClipboardEvent | DragEvent) => {
      event.preventDefault(); event.stopPropagation();
      const data = 'clipboardData' in event ? event.clipboardData : event.dataTransfer;
      insertCellText(element, data?.getData('text/plain') || ''); this.commit(cell, row, column);
    };
    element.addEventListener('paste', paste); element.addEventListener('drop', paste);
    element.addEventListener('dragover', event => event.preventDefault());
    element.addEventListener('keydown', event => {
      if (event.isComposing || cell.composing || event.keyCode === 229) return;
      if (event.altKey && event.key === 'F10') {
        event.preventDefault(); event.stopPropagation(); this.controls.focusRow(row); return;
      }
      const key = event.key.toLowerCase(), mod = event.ctrlKey || event.metaKey;
      if (mod && ['s', 'z', 'y', 'b', 'i', 'a'].includes(key)) {
        event.preventDefault();
        if (key === 's' || key === 'z' || key === 'y') this.actions[key === 's' ? 'save' : key === 'y' || event.shiftKey ? 'redo' : 'undo']();
        else if (key === 'a') { const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); }
        else { formatCell(element, key === 'b' ? 'bold' : 'italic'); this.commit(cell, row, column); }
        return;
      }
      if (event.key === 'Tab') {
        if (event.shiftKey && row === 0 && column === 0) return;
        event.preventDefault();
        const columns = this.cellViews[0].length, next = row * columns + column + (event.shiftKey ? -1 : 1);
        if (next >= this.cellViews.length * columns) this.insertRow(0);
        else this.focusCell(Math.floor(next / columns), next % columns);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) { insertCellText(element, '\n'); this.commit(cell, row, column); }
        else if (row + 1 >= this.cellViews.length) this.insertRow();
        else this.focusCell(row + 1, column);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        const end = this.model.to, atEnd = end === this.view.state.doc.length;
        this.view.dispatch({ ...(atEnd ? { changes: { from: end, insert: '\n\n' }, userEvent: 'input' } : {}),
          selection: { anchor: end + (atEnd ? 2 : 1) }, scrollIntoView: true }); this.view.focus();
      }
    });
  }

  private write(changes: ChangeSpec) {
    if (this.writing || this.view.state.sliceDoc(this.model.from, this.model.to) !== this.model.source) return;
    this.writing = true;
    try { this.view.dispatch({ changes, userEvent: 'input' }); } finally { this.writing = false; }
  }
  private commit(cell: CellView, row: number, column: number) {
    const value = serializeCell(cell.element);
    if (value === cell.serialized) return;
    const changes = editCell(this.model, row, column, value);
    cell.markdown = value; cell.serialized = value; this.write(changes);
  }
  private insertRow(focusColumn = this.current.column) {
    const row = this.current.row;
    this.changeStructure(addRowAt(this.view.state, this.model, row + 1), row + 1, focusColumn);
  }
  private isComposing() { return this.cellViews.some(row => row.some(cell => cell.composing)); }
  private changeStructure(changes: ChangeSpec, row: number, column: number) {
    if (this.isComposing()) return;
    this.write(changes);
    this.focusCell(Math.min(row, this.cellViews.length - 1), Math.min(column, this.cellViews[0].length - 1));
  }
  private removeTable() {
    if (this.isComposing() || this.writing || this.view.state.sliceDoc(this.model.from, this.model.to) !== this.model.source) return;
    const changes = deleteTable(this.view.state, this.model) as { from: number; to: number; insert: string };
    this.view.dispatch({ changes, selection: { anchor: changes.from }, userEvent: 'input' });
    this.view.focus();
  }
  private placeCaret(element: HTMLElement) {
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(false);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
  }
  focusCell(row = 0, column = 0) {
    const cell = this.cellViews[row]?.[column];
    if (cell) { cell.element.focus(); this.placeCaret(cell.element); }
  }
  format(kind: Format, value?: number | string) {
    const { row, column } = this.current, cell = this.cellViews[row]?.[column];
    if (!cell || cell.composing) return;
    if (kind === 'image-file' && typeof value === 'string' ? insertCellImage(cell.element, value) : formatCell(cell.element, kind)) this.commit(cell, row, column);
  }
  contains(position: number) { return this.root.isConnected && position >= this.model.from && position <= this.model.to; }
  focusAt(position: number) {
    const rows = this.model.rows.filter((_, index) => index !== 1);
    let row = rows.findIndex(source => position >= source.from && position <= source.from + source.text.length);
    if (row < 0) row = 0;
    const parts = cells(rows[row]);
    let column = parts.findIndex(cell => position >= cell.start && position <= cell.to);
    if (column < 0) column = position <= (parts[0]?.start ?? position) ? 0 : Math.min(parts.length - 1, this.cellViews[0].length - 1);
    this.focusCell(row, Math.max(0, column));
  }
  insertText(text: string) {
    const { row, column } = this.current, cell = this.cellViews[row]?.[column];
    if (cell) { insertCellText(cell.element, text); this.commit(cell, row, column); }
  }
  destroy() {
    this.controls.destroy();
    tables.get(this.view)?.delete(this);
    if (active.get(this.view) === this) active.delete(this.view);
  }
}
