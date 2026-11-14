import { useEffect, useLayoutEffect, useRef } from 'react';
import type { FileEntry, SearchAction } from '../../../shared/messages';
import { FileActions } from './file-actions';

export function FileContextMenu({ entry, onAction, onClose }: {
  entry: FileEntry; onAction(type: SearchAction, id: string): void; onClose(focus?: boolean): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { root.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) onClose(); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [onClose]);
  return <div className="file-context-menu" role="menu" aria-label={`${entry.label}の操作`} ref={root} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(true); }
    if (event.key === 'Tab') onClose();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const buttons = [...event.currentTarget.querySelectorAll('button')];
      const index = buttons.findIndex(button => button === document.activeElement);
      buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
  }}><FileActions entry={entry} menu onAction={(type, id) => { onClose(true); onAction(type, id); }} /></div>;
}
