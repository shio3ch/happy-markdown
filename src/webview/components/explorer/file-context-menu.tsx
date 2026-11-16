import { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useExplorerDefaultKeybindingLabel } from '../../hooks/use-explorer-platform';
import type { ExplorerAction, FileEntry, FileOperation } from '../../../shared/messages';

export function FileContextMenu({ entry, position, canPaste, onAction, onFileOperation, onClose }: {
  entry?: FileEntry; position?: { x: number; y: number }; canPaste?: boolean;
  onAction(type: ExplorerAction, id: string): void; onFileOperation(action: FileOperation, id?: string): void; onClose(focus?: boolean): void;
}) {
  const shortcut = useExplorerDefaultKeybindingLabel();
  const caption = (label: string, keys?: string) => <><span className="menu-label">{label}</span>{keys && <kbd className="explorer-shortcut" title="既定のショートカット">{keys}（既定）</kbd>}</>;
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = root.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(position?.x ?? 8, window.innerWidth - rect.width - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(position?.y ?? 40, window.innerHeight - rect.height - 4))}px`;
    menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [position]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) onClose(); };
    const close = () => onClose();
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !root.current?.contains(event.target)) onClose(); };
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', close); window.addEventListener('blur', close); window.addEventListener('scroll', scroll, true);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); window.removeEventListener('blur', close); window.removeEventListener('scroll', scroll, true); };
  }, [onClose]);
  const operation = (action: FileOperation, label: string, disabled = false) => <button type="button" role="menuitem" disabled={disabled} onClick={() => { onClose(true); onFileOperation(action, entry?.id); }}>{caption(label, shortcut(action))}</button>;
  const action = (type: ExplorerAction, label: string) => <button type="button" role="menuitem" onClick={() => { onClose(true); if (entry) onAction(type, entry.id); }}>{caption(label, type === 'openTab' || type === 'openSide' || type === 'openPreview' ? shortcut(type) : undefined)}</button>;
  return createPortal(<div className="file-context-menu" role="menu" aria-label={`${entry?.label ?? 'ワークスペース'}の操作`} ref={root}
    onClick={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(true); }
      if (event.key === 'Tab') onClose();
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.findIndex(button => button === document.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
      }
    }}>
    {entry && !entry.children && <>{action('open', 'ファイルを開く')}{action('openTab', '新規タブでファイルを開く')}{action('openSide', '横に開く')}{operation('duplicate', '複製の作成')}<div role="separator" />
      {operation('copy', 'コピー')}{operation('cut', '切り取り')}<div role="separator" /></>}
    {(!entry || entry.children) && <>{operation('newFile', 'ファイルの新規作成')}{operation('newFolder', 'フォルダーの新規作成')}</>}
    {operation('paste', '貼り付け', !canPaste)}
    {entry && <><div role="separator" />{operation('copyPath', 'パスのコピー')}{operation('copyRelativePath', '相対パスのコピー')}
      {!entry.root && <><div role="separator" />{operation('rename', '名前の変更')}{operation('delete', '削除')}</>}
      {!entry.children && <><div role="separator" />{action('source', 'ソースを開く')}{action('bookmark', entry.bookmarked ? 'ブックマーク解除' : 'ブックマークに追加')}</>}
    </>}
  </div>, document.body);
}
