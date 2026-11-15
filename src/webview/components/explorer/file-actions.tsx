import type { FileEntry, SearchAction } from '../../../shared/messages';

export function FileActions({ entry, menu = false, onAction }: {
  entry: FileEntry; menu?: boolean; onAction(type: SearchAction, id: string): void;
}) {
  const bookmark = entry.bookmarked ? 'ブックマーク解除' : 'ブックマークに追加';
  return <>
    <button type="button" role={menu ? 'menuitem' : undefined} title="ソースを開く" aria-label={`${entry.label}のソースを開く`}
      onClick={event => { event.stopPropagation(); onAction('source', entry.id); }}>{menu ? 'ソースを開く' : '‹›'}</button>
    <button type="button" role={menu ? 'menuitem' : undefined} title={bookmark} aria-label={`${entry.label}を${bookmark}`}
      aria-pressed={menu ? undefined : entry.bookmarked} onClick={event => { event.stopPropagation(); onAction('bookmark', entry.id); }}>{menu ? bookmark : entry.bookmarked ? '▣' : '▢'}</button>
  </>;
}
