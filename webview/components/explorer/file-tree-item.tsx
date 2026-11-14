import type { KeyboardEvent, ReactNode, RefCallback } from 'react';
import type { FileEntry, SearchAction } from '../../../shared/messages';
import { ThemeIcon } from './theme-icon';
import { FileActions } from './file-actions';
import { FileContextMenu } from './file-context-menu';

export function FileTreeItem({ entry, level, expanded, selected, tabIndex, elementRef, contextOpen, onContext, onSelect, onActivate, onKeyDown, onAction, children }: {
  entry: FileEntry; level: number; expanded: boolean; selected: boolean; tabIndex: number; elementRef: RefCallback<HTMLLIElement>;
  contextOpen: boolean; onContext(open: boolean, focus?: boolean): void; onSelect(): void; onActivate(): void;
  onKeyDown(event: KeyboardEvent<HTMLLIElement>): void; onAction(type: SearchAction, id: string): void; children?: ReactNode;
}) {
  return <li role="treeitem" aria-label={entry.label} aria-level={level} aria-expanded={entry.children ? expanded : undefined}
    aria-selected={selected} tabIndex={tabIndex} ref={elementRef} data-entry={entry.id}
    onFocus={event => { if (event.target === event.currentTarget) onSelect(); }} onKeyDown={onKeyDown}>
    <div className={`file-row${entry.active ? ' active' : ''}${selected ? ' selected' : ''}`} style={{ paddingLeft: `${8 + (level - 1) * 16}px` }}
      title={entry.path} onClick={event => { event.stopPropagation(); onSelect(); onActivate(); }}
      onContextMenu={event => { if (entry.children) return; event.preventDefault(); event.stopPropagation(); onContext(true); }}>
      <span className="folder-arrow" aria-hidden="true">{entry.children ? expanded ? '⌄' : '›' : ''}</span>
      <ThemeIcon icon={entry.icon} /><span className="file-label">{entry.label}</span>
      {entry.children && <span className="file-description">{entry.children.length}項目</span>}
      {entry.active && !entry.children && <span className="active-label">表示中</span>}
      {!entry.children && <span className="file-actions"><FileActions entry={entry} onAction={onAction} /></span>}
      {contextOpen && <FileContextMenu entry={entry} onAction={onAction} onClose={focus => onContext(false, focus)} />}
    </div>
    {children}
  </li>;
}
