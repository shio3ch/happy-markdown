import type { ChangeSpec, EditorState } from '@codemirror/state';

export interface SourceRow { text: string; from: number }
export interface TableModel { from: number; to: number; source: string; rows: readonly SourceRow[] }
export interface SourceCell { from: number; to: number; start: number; text: string; raw: string }

export function cells(row: SourceRow): SourceCell[] {
  const text = row.text.trim();
  const offset = row.from + row.text.length - row.text.trimStart().length;
  const boundaries = [-1];
  for (let index = 0; index < text.length; index++)
    if (text[index] === '|' && text[index - 1] !== '\\') boundaries.push(index);
  boundaries.push(text.length);
  const result: SourceCell[] = [];
  for (let index = 1; index < boundaries.length; index++) {
    const start = boundaries[index - 1] + 1, end = boundaries[index];
    if (start === end && (index === 1 || index === boundaries.length - 1)) continue;
    const raw = text.slice(start, end);
    const from = offset + start + raw.length - raw.trimStart().length;
    const to = Math.max(from, offset + end - (raw.length - raw.trimEnd().length));
    result.push({ from, to, start: offset + start, text: raw.trim(), raw });
  }
  return result;
}

export const sourceRowIndex = (row: number) => row === 0 ? 0 : row + 1;

function appendCells(row: SourceRow, values: readonly string[]): ChangeSpec {
  const text = row.text.trimEnd();
  const trailing = text.endsWith('|') && text[text.length - 2] !== '\\';
  return trailing
    ? { from: row.from + text.length - 1, insert: values.map(value => `| ${value} `).join('') }
    : { from: row.from + text.length, insert: values.map(value => ` | ${value} `).join('') + '|' };
}

export function editCell(model: TableModel, row: number, column: number, value: string): ChangeSpec {
  const source = model.rows[sourceRowIndex(row)];
  const parts = cells(source);
  const cell = parts[column];
  if (cell) {
    const trimmed = source.text.trim();
    const leading = trimmed.startsWith('|'), trailing = trimmed.endsWith('|') && trimmed[trimmed.length - 2] !== '\\';
    // 外側のパイプがない表も、端のセルを空にしたときに列を失わない。
    if (!value && (!leading && column === 0 || !trailing && column === parts.length - 1)) {
      const text = source.text.slice(0, cell.from - source.from) + source.text.slice(cell.to - source.from);
      return { from: source.from, to: source.from + source.text.length,
        insert: (!leading && column === 0 ? '| ' : '') + text + (!trailing && column === parts.length - 1 ? ' |' : '') };
    }
    return { from: cell.from, to: cell.to, insert: value };
  }
  return appendCells(source, Array.from({ length: column - parts.length + 1 }, (_, index) => index === column - parts.length ? value : ''));
}

export function addRow(state: EditorState, model: TableModel, after: number): ChangeSpec {
  const source = model.rows[after === 0 ? 1 : sourceRowIndex(after)];
  const delimiter = model.rows[1];
  const prefix = state.doc.sliceString(state.doc.lineAt(delimiter.from).from, delimiter.from);
  return { from: source.from + source.text.length, insert: '\n' + prefix + '| ' + Array(cells(model.rows[0]).length).fill('').join(' | ') + ' |' };
}

export function addColumn(model: TableModel, after: number): ChangeSpec[] {
  const index = after + 1;
  return model.rows.map((row, rowIndex) => {
    const parts = cells(row), value = rowIndex === 1 ? '---' : '';
    if (index < parts.length) return { from: parts[index].start, insert: ` ${value} |` };
    return appendCells(row, Array.from({ length: index - parts.length + 1 }, (_, fill) => fill === index - parts.length ? value : ''));
  });
}

// 行の順序が変わっても、引用・リストの接頭辞は移動先の物理行に残す。
function replaceRows(state: EditorState, model: TableModel, rows: readonly string[]): ChangeSpec {
  const header = cells({ text: rows[0], from: 0 });
  const delimiter = cells(model.rows[1]);
  const count = Math.max(header.length, delimiter.length);
  const pad = (text: string, parts: SourceCell[], fill: string) => parts.length === count ? text
    : '|' + [...parts.map(cell => cell.raw), ...Array(count - parts.length).fill(fill)].join('|') + '|';
  // 短い行や余剰セルのある行が見出しになっても、区切り行と列数を一致させる。
  const physical = [pad(rows[0], header, ' '), pad(model.rows[1].text, delimiter, ' --- '), ...rows.slice(1)];
  const continuation = state.doc.sliceString(state.doc.lineAt(model.rows[1].from).from, model.rows[1].from);
  return { from: model.from, to: model.to, insert: physical.map((text, index) => {
    const source = model.rows[index];
    const prefix = index === 0 ? '' : source ? state.doc.sliceString(state.doc.lineAt(source.from).from, source.from) : continuation;
    return prefix + text;
  }).join('\n') };
}

export function deleteTable(state: EditorState, model: TableModel): ChangeSpec {
  const from = state.doc.lineAt(model.from).from;
  const last = state.doc.lineAt(model.to);
  return { from, to: last.to + (last.to < state.doc.length ? 1 : 0), insert: '' };
}

export function addRowAt(state: EditorState, model: TableModel, boundary: number): ChangeSpec {
  if (boundary > 0) return addRow(state, model, boundary - 1);
  const rows = model.rows.filter((_, index) => index !== 1).map(row => row.text);
  rows.unshift('| ' + Array(cells(model.rows[0]).length).fill('').join(' | ') + ' |');
  return replaceRows(state, model, rows);
}

export function deleteRow(state: EditorState, model: TableModel, index: number): ChangeSpec {
  const rows = model.rows.filter((_, row) => row !== 1).map(row => row.text);
  if (rows.length === 1) return deleteTable(state, model);
  rows.splice(index, 1);
  return replaceRows(state, model, rows);
}

export function moveRow(state: EditorState, model: TableModel, index: number, boundary: number): ChangeSpec {
  const rows = model.rows.filter((_, row) => row !== 1).map(row => row.text);
  const [row] = rows.splice(index, 1);
  rows.splice(boundary > index ? boundary - 1 : boundary, 0, row);
  return replaceRows(state, model, rows);
}

function changeColumns(model: TableModel, change: (parts: string[]) => void): ChangeSpec[] {
  const count = cells(model.rows[0]).length;
  return model.rows.map((row, index) => {
    const parts = cells(row).map(cell => cell.raw);
    while (parts.length < count) parts.push(index === 1 ? ' --- ' : ' ');
    const visible = parts.splice(0, count);
    change(visible);
    return { from: row.from, to: row.from + row.text.length, insert: '|' + [...visible, ...parts].join('|') + '|' };
  });
}

export function deleteColumn(state: EditorState, model: TableModel, index: number): ChangeSpec {
  if (cells(model.rows[0]).length === 1) return deleteTable(state, model);
  return changeColumns(model, parts => { parts.splice(index, 1); });
}

export function moveColumn(model: TableModel, index: number, boundary: number): ChangeSpec {
  return changeColumns(model, parts => {
    const [part] = parts.splice(index, 1);
    parts.splice(boundary > index ? boundary - 1 : boundary, 0, part);
  });
}
