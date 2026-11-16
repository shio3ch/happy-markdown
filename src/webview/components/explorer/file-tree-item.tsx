import type { DragEvent, KeyboardEvent, ReactNode, RefCallback } from 'react';
import type { FileEntry, ExplorerAction, FileOperation } from '../../../shared/messages';
import { ThemeIcon } from './theme-icon';
import { FileActions } from './file-actions';
import { FileContextMenu } from './file-context-menu';

export function FileTreeItem({ entry, level, expanded, selected, tabIndex, elementRef, contextOpen, onContext, onSelect, onActivate, onKeyDown, onAction, onFileOperation, canPaste, cut, dropTarget, onDragStart, onDragEnd, onDragOver, onDrop, position, children }: {
  entry: FileEntry; level: number; expanded: boolean; selected: boolean; tabIndex: number; elementRef: RefCallback<HTMLLIElement>;
  contextOpen: boolean; onContext(open: boolean, focus?: boolean, position?: { x: number; y: number }): void; onSelect(): void; onActivate(pinned?: boolean): void;
  onKeyDown(event: KeyboardEvent<HTMLLIElement>): void; onAction(type: ExplorerAction, id: string): void;
  onFileOperation(action: FileOperation, id?: string): void; canPaste?: boolean; cut: boolean; dropTarget: boolean;
  onDragStart(event: DragEvent<HTMLDivElement>): void; onDragEnd(): void; onDragOver(event: DragEvent<HTMLDivElement>): void; onDrop(event: DragEvent<HTMLDivElement>): void;
  position?: { x: number; y: number }; children?: ReactNode;
}) {
  return <li role="treeitem" aria-label={entry.label} aria-level={level} aria-expanded={entry.children ? expanded : undefined}
    aria-selected={selected} tabIndex={tabIndex} ref={elementRef} data-entry={entry.id}
    onKeyDown={onKeyDown}>
    <div className={`file-row${entry.active ? ' active' : ''}${selected ? ' selected' : ''}${cut ? ' cut' : ''}${dropTarget ? ' drop-target' : ''}`} style={{ paddingLeft: `${8 + (level - 1) * 16}px` }}
      draggable={!entry.children} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragOver={onDragOver} onDrop={onDrop}
      title={entry.path} onClick={event => { event.stopPropagation(); if (event.detail > 1) return; onSelect(); onActivate(); }}
      onDoubleClick={event => { event.stopPropagation(); if (event.target instanceof Element && event.target.closest('button, [role="menu"]')) return; onSelect(); onActivate(true); }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); onSelect(); onContext(true, false, { x: event.clientX, y: event.clientY }); }}>
      <span className="folder-arrow" aria-hidden="true">{entry.children ? expanded ? '⌄' : '›' : ''}</span>
      <ThemeIcon icon={entry.icon} /><span className="file-label">{entry.label}</span>
      {entry.children && <span className="file-description">{entry.children.length}項目</span>}
      {entry.active && !entry.children && <span className="active-label">表示中</span>}
      {!entry.children && <span className="file-actions"><FileActions entry={entry} onAction={onAction} /></span>}
      {contextOpen && <FileContextMenu entry={entry} position={position} canPaste={canPaste} onFileOperation={onFileOperation} onAction={onAction} onClose={focus => onContext(false, focus)} />}
    </div>
    {children}
  </li>;
}
