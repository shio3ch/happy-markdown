import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { FileEntry, SearchAction } from '../../../shared/messages';
import { FileTreeItem } from './file-tree-item';

interface VisibleEntry { entry: FileEntry; parent?: string }
export function FileTree({ nodes, expandedIds, revealId, revealRevision, label = 'Markdownファイル', onExpand, onAction }: {
  nodes: FileEntry[]; expandedIds: string[]; revealId?: string; revealRevision: number; label?: string;
  onExpand(id: string, expanded: boolean): void; onAction(type: SearchAction, id: string): void;
}) {
  const elements = useRef(new Map<string, HTMLLIElement>());
  const typed = useRef({ text: '', time: 0 });
  const [focused, setFocused] = useState<string>(), [selected, setSelected] = useState<string>(), [context, setContext] = useState<string>();
  const visible = useMemo(() => {
    const entries: VisibleEntry[] = [];
    const visit = (items: FileEntry[], parent?: string) => items.forEach(entry => {
      entries.push({ entry, parent });
      if (entry.children && expandedIds.includes(entry.id)) visit(entry.children, entry.id);
    });
    visit(nodes); return entries;
  }, [nodes, expandedIds]);
  const focusTarget = visible.some(item => item.entry.id === focused) ? focused : visible[0]?.entry.id;
  useLayoutEffect(() => {
    if (!revealId) return;
    setFocused(revealId); setSelected(revealId);
    elements.current.get(revealId)?.scrollIntoView({ block: 'nearest' });
  }, [revealId, revealRevision]);
  const focus = (id?: string) => { if (id) { setFocused(id); elements.current.get(id)?.focus(); } };
  const activate = (entry: FileEntry) => entry.children ? onExpand(entry.id, !expandedIds.includes(entry.id)) : onAction('open', entry.id);
  const keydown = (event: KeyboardEvent<HTMLLIElement>, entry: FileEntry) => {
    if (event.target !== event.currentTarget) return;
    const index = visible.findIndex(item => item.entry.id === entry.id);
    if (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) {
      const now = Date.now(), letter = event.key.toLocaleLowerCase();
      typed.current.text = now - typed.current.time < 600 ? typed.current.text + letter : letter;
      typed.current.time = now;
      const term = [...typed.current.text].every(char => char === letter) ? letter : typed.current.text;
      const next = [...visible.slice(index + 1), ...visible.slice(0, index + 1)].find(item => item.entry.label.toLocaleLowerCase().startsWith(term));
      if (next) { event.preventDefault(); event.stopPropagation(); focus(next.entry.id); }
      return;
    }
    typed.current.text = '';
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', 'Enter', ' ', 'ContextMenu'];
    if (!keys.includes(event.key) && !(event.shiftKey && event.key === 'F10')) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key === 'ArrowDown') focus(visible[Math.min(index + 1, visible.length - 1)]?.entry.id);
    if (event.key === 'ArrowUp') focus(visible[Math.max(index - 1, 0)]?.entry.id);
    if (event.key === 'Home') focus(visible[0]?.entry.id);
    if (event.key === 'End') focus(visible.at(-1)?.entry.id);
    if (event.key === 'ArrowRight' && entry.children) {
      if (!expandedIds.includes(entry.id)) onExpand(entry.id, true); else focus(entry.children[0]?.id);
    }
    if (event.key === 'ArrowLeft') {
      if (entry.children && expandedIds.includes(entry.id)) onExpand(entry.id, false); else focus(visible[index]?.parent);
    }
    if (event.key === 'Enter' || event.key === ' ') activate(entry);
    if (!entry.children && (event.key === 'ContextMenu' || event.key === 'F10')) setContext(entry.id);
  };
  const list = (items: FileEntry[], level: number) => items.map(entry => <FileTreeItem key={entry.id} entry={entry} level={level}
    expanded={expandedIds.includes(entry.id)} selected={selected === entry.id} tabIndex={entry.id === focusTarget ? 0 : -1}
    elementRef={element => { if (element) elements.current.set(entry.id, element); else elements.current.delete(entry.id); }}
    contextOpen={context === entry.id} onContext={(open, restore) => { setContext(open ? entry.id : undefined); if (restore) focus(entry.id); }}
    onSelect={() => { setSelected(entry.id); setFocused(entry.id); }} onActivate={() => { focus(entry.id); activate(entry); }} onKeyDown={event => keydown(event, entry)} onAction={onAction}>
    {entry.children && expandedIds.includes(entry.id) && <ul role="group">{list(entry.children, level + 1)}</ul>}
  </FileTreeItem>);
  return <ul className="file-tree" role="tree" aria-label={label}>{list(nodes, 1)}</ul>;
}
