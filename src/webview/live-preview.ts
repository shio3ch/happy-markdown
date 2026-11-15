import { StateEffect } from '@codemirror/state';
import type { Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import { tableComposition } from './table-preview';

// 表示だけを変え、Markdown本文・選択位置・ホスト側の履歴には触れない。
const refresh = StateEffect.define<null>();

class BulletWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-bullet';
    span.textContent = '•';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}

class RuleWidget extends WidgetType {
  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-live-rule';
    span.setAttribute('role', 'separator');
    return span;
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) { super(); }
  eq(other: TaskWidget) { return this.checked === other.checked; }
  private update(button: HTMLElement) {
    button.setAttribute('aria-checked', String(this.checked));
    button.setAttribute('aria-label', this.checked ? 'タスクを未完了にする' : 'タスクを完了にする');
    button.textContent = this.checked ? '✓' : '';
  }
  toDOM(view: EditorView) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cm-live-task';
    button.setAttribute('role', 'checkbox');
    this.update(button);
    // クリックで先に選択を移すとウィジェットが記法に戻るため、選択は維持する。
    button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', () => {
      if (view.compositionStarted) return;
      const from = view.posAtDOM(button);
      const marker = view.state.sliceDoc(from, from + 3);
      if (!/^\[[ xX]\]$/.test(marker)) return;
      view.dispatch({ changes: { from: from + 1, to: from + 2, insert: marker === '[ ]' ? 'x' : ' ' }, userEvent: 'input' });
    });
    return button;
  }
  updateDOM(dom: HTMLElement) { this.update(dom); return true; }
  ignoreEvent() { return true; }
}

function decorations(view: EditorView): DecorationSet {
  const { state } = view;
  const ranges: Range<Decoration>[] = [];
  const selectedLines = state.selection.ranges.map(range => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.empty ? range.to : range.to - 1).to,
  }));
  const editing = (from: number, to: number) => selectedLines.some(line => from <= line.to && to >= line.from);
  const mark = (from: number, to: number, className: string) => {
    if (from < to) ranges.push(Decoration.mark({ class: className }).range(from, to));
  };
  // 改行は置換しない。複数行の選択や矢印移動の位置関係を保つ。
  const hide = (from: number, to: number, widget?: WidgetType) => {
    if (from < to && state.doc.lineAt(from).number === state.doc.lineAt(to).number)
      ranges.push(Decoration.replace({ widget }).range(from, to));
  };
  const lineClasses = new Map<number, Set<string>>();
  const lines = (from: number, to: number, className: string) => {
    const end = Math.min(to, view.viewport.to);
    for (let line = state.doc.lineAt(Math.max(from, view.viewport.from)); line.from <= end;) {
      const classes = lineClasses.get(line.from) || new Set<string>();
      classes.add(className);
      lineClasses.set(line.from, classes);
      if (line.to >= state.doc.length) break;
      line = state.doc.lineAt(line.to + 1);
    }
  };

  syntaxTree(state).iterate({ from: view.viewport.from, to: view.viewport.to, enter(ref) {
    const node = ref.node;
    const { name, from, to } = ref;
    if (name === 'Table') return false;
    const active = editing(from, to);
    const heading = /^(?:ATX|Setext)Heading([1-7])$/.exec(name);
    if (heading || name === 'Paragraph') {
      const opens: { from: number; to: number }[] = [];
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'HTMLTag') continue;
        const tag = state.sliceDoc(child.from, child.to);
        if (/^<u\s*>$/i.test(tag)) opens.push(child);
        else if (/^<\/u\s*>$/i.test(tag)) {
          const open = opens.pop();
          if (!open) continue;
          mark(open.to, child.from, 'cm-live-underline');
          if (!editing(open.from, child.to)) { hide(open.from, open.to); hide(child.from, child.to); }
        }
      }
    }
    if (heading) {
      lines(from, name.startsWith('Setext') ? (node.lastChild?.from || to) - 1 : to, `cm-live-heading cm-live-h${heading[1]}`);
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name !== 'HeaderMark') continue;
        if (!active) hide(child.from, child.to + (child.from === from && state.sliceDoc(child.to, child.to + 1) === ' ' ? 1 : 0));
        else mark(child.from, child.to, 'cm-live-syntax');
      }
    } else if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough' || name === 'InlineCode') {
      const className = { StrongEmphasis: 'strong', Emphasis: 'emphasis', Strikethrough: 'strike', InlineCode: 'code' }[name];
      mark(from, to, `cm-live-${className}`);
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (!['EmphasisMark', 'StrikethroughMark', 'CodeMark'].includes(child.name)) continue;
        if (!active) hide(child.from, child.to);
        else mark(child.from, child.to, 'cm-live-syntax');
      }
      if (name === 'InlineCode') return false;
    } else if (name === 'Link') {
      // URLをDOMのhrefへ渡さず、表示の装飾だけを行う。
      const open = node.firstChild, close = open?.nextSibling;
      let labelEnd = close;
      while (labelEnd && !(labelEnd.name === 'LinkMark' && state.sliceDoc(labelEnd.from, labelEnd.to) === ']')) labelEnd = labelEnd.nextSibling;
      if (open && labelEnd) {
        mark(open.to, labelEnd.from, 'cm-live-link');
        if (!active) { hide(open.from, open.to); hide(labelEnd.from, to); }
      }
    } else if (name === 'Image' || name === 'HTMLBlock' || name === 'LinkReference') {
      // 画像・任意HTMLは既存のサニタイズ済みプレビューで描画する。
      return false;
    } else if (name === 'ListMark') {
      const task = node.nextSibling?.name === 'Task';
      if (!active && node.parent?.parent?.name === 'BulletList') hide(from, to, task ? undefined : new BulletWidget());
    } else if (name === 'TaskMarker') {
      if (!active) hide(from, to, new TaskWidget(state.sliceDoc(from + 1, from + 2).toLowerCase() === 'x'));
      if (state.sliceDoc(from + 1, from + 2).toLowerCase() === 'x') mark(to, node.parent!.to, 'cm-live-task-done');
    } else if (name === 'Blockquote') {
      lines(from, to, 'cm-live-quote');
    } else if (name === 'QuoteMark') {
      if (!active) hide(from, to + (state.sliceDoc(to, to + 1) === ' ' ? 1 : 0));
      else mark(from, to, 'cm-live-syntax');
    } else if (name === 'FencedCode' || name === 'CodeBlock') {
      lines(from, to, 'cm-live-codeblock');
      // コードの構文木にはMarkdown装飾を適用しない。
      for (let child = node.firstChild; child; child = child.nextSibling) {
        if (child.name === 'CodeMark' && !active) hide(child.from, child.to);
        if (child.name === 'CodeInfo' || child.name === 'CodeMark') mark(child.from, child.to, 'cm-live-syntax');
      }
      return false;
    } else if (name === 'HorizontalRule' && !active) {
      hide(from, to, new RuleWidget());
    }
  } });
  for (const [from, classes] of lineClasses) ranges.push(Decoration.line({ class: [...classes].join(' ') }).range(from));
  return Decoration.set(ranges, true);
}

// 表示範囲と構文木を使い、大きい文書も全文のHTMLへ変換せずに編集する。
export const livePreview = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  private frame = 0;
  constructor(view: EditorView) { this.decorations = decorations(view); }
  update(update: ViewUpdate) {
    if (update.view.compositionStarted) {
      this.decorations = this.decorations.map(update.changes);
      return;
    }
    if (update.docChanged || update.selectionSet || update.viewportChanged || syntaxTree(update.startState) !== syntaxTree(update.state)
      || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refresh))))
      this.decorations = decorations(update.view);
  }
  finishComposition(view: EditorView) {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => { this.frame = 0; view.dispatch({ effects: [refresh.of(null), tableComposition.of(false)] }); });
  }
  destroy() { cancelAnimationFrame(this.frame); }
}, {
  decorations: plugin => plugin.decorations,
  eventHandlers: {
    compositionstart(_event, view) { view.dispatch({ effects: tableComposition.of(true) }); },
    compositionend(_event, view) { this.finishComposition(view); },
  },
});
