  export function createSearch(root) {
    const input = document.getElementById('search');
    const count = document.getElementById('search-count');
    if (!input) return { refresh() {} };
    let matches = 0;
    let current = -1;
    function select(index, scroll = true) {
      current = matches ? (index + matches) % matches : -1;
      root.querySelectorAll('mark[data-search]').forEach(mark => mark.classList.toggle('search-current', Number(mark.dataset.search) === current));
      count.textContent = input.value ? `${current + 1} / ${matches}` : '';
      document.getElementById('search-prev').disabled = !matches;
      document.getElementById('search-next').disabled = !matches;
      if (scroll && current >= 0) {
        const mark = root.querySelector(`mark[data-search="${current}"]`);
        for (let parent = mark?.parentElement; parent && parent !== root; parent = parent.parentElement) {
          if (parent.tagName === 'DETAILS') parent.open = true;
        }
        mark?.scrollIntoView({ block: 'center' });
      }
    }
    function refresh(scroll = true) {
      root.querySelectorAll('mark[data-search]').forEach(mark => mark.replaceWith(...mark.childNodes));
      root.normalize();
      matches = 0;
      if (!input.value) { select(-1, false); return; }
      const nodes = [];
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let text = '', node, previousBlock;
      while ((node = walker.nextNode())) {
        const block = node.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,pre,td,th,summary');
        if (previousBlock && previousBlock !== block) text += '\n';
        previousBlock = block;
        nodes.push({ node, start: text.length, end: text.length + node.length });
        text += node.data;
      }
      // Escaped literal regexp retains original UTF-16 offsets, including Japanese.
      const literal = input.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const found = [...text.matchAll(new RegExp(literal, 'giu'))];
      matches = found.length;
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
      select(0, scroll);
    }
    input.addEventListener('input', () => refresh());
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); select(current + (event.shiftKey ? -1 : 1)); }
      if (event.key === 'Escape') { input.value = ''; refresh(false); input.blur(); }
    });
    document.getElementById('search-prev').addEventListener('click', () => select(current - 1));
    document.getElementById('search-next').addEventListener('click', () => select(current + 1));
    refresh(false);
    return { refresh };
  }
