import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import type { FileEntry, ExplorerAction, FileOperation } from '../../../shared/messages';
import { Icon } from '../common/icon';
import { Tooltip } from '../common/tooltip';
import { FileContextMenu } from './file-context-menu';
import { useExplorerDefaultKeybindingLabel } from '../../hooks/use-explorer-platform';
import { useExplorerTreeFocus } from '../../hooks/use-explorer-tree-focus';
import { FileTreeItem } from './file-tree-item';

interface VisibleEntry { entry: FileEntry; parent?: string }
export function FileTree({ nodes, expandedIds, revealId, revealRevision, label = 'Markdownファイル', onExpand, onAction, onFileOperation, onMove, cutId, canPaste, writable = true, tools = false, onSelection, onTreeFocus, focusId, focusRevision = 0, treeCommand, treeCommandRevision = 0 }: {
  treeCommand?: 'contextMenu' | 'toggleFolder'; treeCommandRevision?: number; focusId?: string; focusRevision?: number; nodes: FileEntry[]; expandedIds: string[]; revealId?: string; revealRevision: number; label?: string;
  onExpand(id: string, expanded: boolean): void; onAction(type: ExplorerAction, id: string): void;
  onFileOperation(action: FileOperation, id?: string): void; onMove(id: string, targetId?: string): void;
  onTreeFocus?(focused: boolean): void;
  onSelection?(id?: string): void;
  cutId?: string; canPaste?: boolean; writable?: boolean; tools?: boolean;
}) {
  const shortcutLabel = useExplorerDefaultKeybindingLabel();
  const dragged = useRef<string>(undefined);
  const [dropTarget, setDropTarget] = useState<string>(), [position, setPosition] = useState<{ x: number; y: number }>();
  const treeElement = useRef<HTMLUListElement>(null);
  const elements = useRef(new Map<string, HTMLLIElement>());
  const typed = useRef({ text: '', time: 0 });
  const [focused, setFocused] = useState<string>(), [selected, setSelected] = useState<string>(), [context, setContext] = useState<string>();
  const select = useCallback((id?: string) => {
    setSelected(id); setFocused(id); onSelection?.(id);
  }, [onSelection]);
  const treeFocus = useExplorerTreeFocus(treeElement, select, onTreeFocus);
  const visible = useMemo(() => {
    const entries: VisibleEntry[] = [];
    const visit = (items: FileEntry[], parent?: string) => items.forEach(entry => {
      entries.push({ entry, parent });
      if (entry.children && expandedIds.includes(entry.id)) visit(entry.children, entry.id);
    });
    visit(nodes); return entries;
  }, [nodes, expandedIds]);
  const operationTarget = visible.some(item => item.entry.id === selected) ? selected : undefined;
  useLayoutEffect(() => { onSelection?.(operationTarget); }, [operationTarget, onSelection]);
  const focusTarget = visible.some(item => item.entry.id === focused) ? focused : visible[0]?.entry.id;
  useLayoutEffect(() => {
    if (!focusRevision) return;
    const id = focusId && elements.current.has(focusId) ? focusId : focusTarget;
    if (id) elements.current.get(id)?.focus(); else treeElement.current?.focus();
  }, [focusRevision]);
  useLayoutEffect(() => {
    if (!revealId) return;
    const active = document.activeElement;
    // Follow editor changes only when they do not replace a user's keyboard target.
    if (document.hasFocus() && active instanceof HTMLElement && treeElement.current?.contains(active) &&
        active.matches('[role="treeitem"], [role="tree"]') && active.dataset.entry !== revealId) return;
    setFocused(revealId); setSelected(revealId);
    elements.current.get(revealId)?.scrollIntoView({ block: 'nearest' });
  }, [revealId, revealRevision]);
  useLayoutEffect(() => {
    if (!treeCommandRevision || !treeCommand) return;
    const active = document.activeElement;
    const id = active instanceof HTMLElement && active.getAttribute('role') === 'treeitem' ? active.dataset.entry : undefined;
    const entry = visible.find(item => item.entry.id === id)?.entry;
    if (!treeElement.current?.contains(active) || (active?.getAttribute('role') !== 'treeitem' && active !== treeElement.current)) return;
    if (treeCommand === 'toggleFolder' && entry?.children) onExpand(entry.id, !expandedIds.includes(entry.id));
    if (treeCommand === 'contextMenu') {
      const rect = active!.getBoundingClientRect();
      setPosition({ x: rect.left + 12, y: rect.top + 24 });
      setContext(entry?.id ?? 'root');
    }
  }, [treeCommandRevision]);
  const focus = (id?: string) => { if (id) { setFocused(id); elements.current.get(id)?.focus(); } };
  const activate = (entry: FileEntry, pinned = false) => {
    if (entry.children) { if (!pinned) onExpand(entry.id, !expandedIds.includes(entry.id)); }
    else onAction(pinned ? 'openTab' : 'openPreview', entry.id);
  };
  const keydown = (event: KeyboardEvent<HTMLLIElement>, entry: FileEntry) => {
    if (event.target !== event.currentTarget) return;
    const index = visible.findIndex(item => item.entry.id === entry.id);
    if (event.defaultPrevented) return;
    if (event.nativeEvent.isComposing || event.keyCode === 229) { event.stopPropagation(); return; }
    // Commands and their shortcuts are resolved by VS Code, not by this Webview.
    if (event.repeat && !['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.stopPropagation(); return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
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
    if (event.shiftKey) return;
    const keys = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
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
  };
  const dragOver = (event: DragEvent, entry?: FileEntry) => {
    event.stopPropagation();
    if (!dragged.current || (entry && !entry.children) || entry?.id === dragged.current) { setDropTarget(undefined); return; }
    event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(entry?.id ?? 'root');
  };
  const drop = (event: DragEvent, entry?: FileEntry) => {
    event.stopPropagation();
    if (dragged.current && (!entry || entry.children) && entry?.id !== dragged.current) { event.preventDefault(); onMove(dragged.current, entry?.id); }
    dragged.current = undefined; setDropTarget(undefined);
  };
  const list = (items: FileEntry[], level: number) => items.map(entry => <FileTreeItem key={entry.id} entry={entry} level={level}
    expanded={expandedIds.includes(entry.id)} selected={selected === entry.id} tabIndex={entry.id === focusTarget ? 0 : -1}
    elementRef={element => { if (element) elements.current.set(entry.id, element); else elements.current.delete(entry.id); }}
    contextOpen={context === entry.id} onContext={(open, restore, point) => { setPosition(point); setContext(open ? entry.id : undefined); if (restore) focus(entry.id); }}
    onSelect={() => select(entry.id)} onActivate={pinned => { focus(entry.id); activate(entry, pinned); }} onKeyDown={event => keydown(event, entry)} onAction={onAction}
    onFileOperation={onFileOperation} canPaste={canPaste} cut={cutId === entry.id} dropTarget={dropTarget === entry.id} position={position}
    onDragStart={event => { event.stopPropagation(); if (entry.children) { event.preventDefault(); return; } dragged.current = entry.id; setContext(undefined); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', entry.id); }}
    onDragEnd={() => { dragged.current = undefined; setDropTarget(undefined); }} onDragOver={event => dragOver(event, entry)} onDrop={event => drop(event, entry)}>
    {entry.children && expandedIds.includes(entry.id) && <ul role="group">{list(entry.children, level + 1)}</ul>}
  </FileTreeItem>);
  return <>
    {tools && <div className="explorer-file-tools" role="toolbar" aria-label="ファイル操作">
      <Tooltip text={writable ? '選択した場所にMarkdownファイルを新規作成' : 'ファイルを作成するにはフォルダーを開いてください'}>
        <button type="button" aria-label="ファイルの新規作成" disabled={!writable} onClick={() => onFileOperation('newFile', operationTarget)}><Icon name="newFile" /></button>
      </Tooltip>
      <Tooltip text={writable ? '選択した場所にフォルダーを新規作成' : 'フォルダーを作成するにはワークスペースを開いてください'}>
        <button type="button" aria-label="フォルダーの新規作成" disabled={!writable} onClick={() => onFileOperation('newFolder', operationTarget)}><Icon name="newFolder" /></button>
      </Tooltip>
      <Tooltip text={`${!writable ? '貼り付けるにはフォルダーを開いてください' : canPaste ? 'コピー・切り取りしたファイルを選択した場所に貼り付け' : '貼り付けるファイルを先にコピー・切り取りしてください'}（既定: ${shortcutLabel('paste')}）`}>
        <button type="button" aria-label="貼り付け" disabled={!writable || !canPaste} onClick={() => onFileOperation('paste', operationTarget)}><Icon name="paste" /></button>
      </Tooltip>
    </div>}
    <ul ref={treeElement} className={`file-tree${dropTarget === 'root' ? ' drop-target' : ''}`} role="tree" aria-label={label} tabIndex={visible.length ? -1 : 0}
      onKeyDown={event => {
        if (event.target === event.currentTarget && (event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat)) event.stopPropagation();
      }}
      {...treeFocus}

      onDragOver={event => dragOver(event)} onDrop={event => drop(event)} onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDropTarget(undefined); }}
      onContextMenu={event => { if (event.target !== event.currentTarget || !writable) return; event.preventDefault(); setSelected(undefined); setPosition({ x: event.clientX, y: event.clientY }); setContext('root'); }}
      onClick={event => { if (event.target === event.currentTarget) { select(undefined); treeElement.current?.focus(); setContext(undefined); } }}>
      {list(nodes, 1)}
    </ul>
    {context === 'root' && <FileContextMenu position={position} canPaste={canPaste} onAction={onAction} onFileOperation={onFileOperation} onClose={restore => { setContext(undefined); if (restore) treeElement.current?.focus(); }} />}
  </>;
}
