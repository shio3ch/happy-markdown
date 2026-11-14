// Markdownの本文だけを操作する。検索欄と件数の表示はReactが管理する。
export function highlightMatches(root: HTMLElement, term: string): number {
  root.querySelectorAll<HTMLElement>('mark[data-search]').forEach(mark => mark.replaceWith(...mark.childNodes));
  root.normalize();
  if (!term) return 0;
  const nodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  let node: Node | null, previousBlock: Element | null | undefined;
  while ((node = walker.nextNode())) {
    if (!(node instanceof Text)) continue;
    const block = node.parentElement?.closest('p,li,h1,h2,h3,h4,h5,h6,pre,td,th,summary');
    if (previousBlock && previousBlock !== block) text += '\n';
    previousBlock = block;
    nodes.push({ node, start: text.length, end: text.length + node.length });
    text += node.data;
  }
  // Escaped literal regexp retains original UTF-16 offsets, including Japanese.
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const found = [...text.matchAll(new RegExp(literal, 'giu'))];
  const matches = found.length;
  for (let i = found.length - 1; i >= 0; i--) {
    const start = found[i].index, end = start + found[i][0].length;
    for (const entry of [...nodes].reverse()) {
      if (entry.end <= start || entry.start >= end) continue;
      const range = document.createRange();
      range.setStart(entry.node, Math.max(0, start - entry.start));
      range.setEnd(entry.node, Math.min(entry.node.length, end - entry.start));
      const mark = document.createElement('mark');
      mark.dataset.search = String(i);
      range.surroundContents(mark);
    }
  }
  return matches;
}

export function selectMatch(root: HTMLElement, index: number, scroll = true) {
  root.querySelectorAll<HTMLElement>('mark[data-search]').forEach(mark => mark.classList.toggle('search-current', Number(mark.dataset.search) === index));
  const mark = root.querySelector<HTMLElement>(`mark[data-search="${index}"]`);
  if (!scroll || !mark) return;
  for (let parent = mark.parentElement; parent && parent !== root; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  mark.scrollIntoView({ block: 'center' });
}
