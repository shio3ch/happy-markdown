import type { FileEntry, SearchAction } from '../../../shared/messages';
import { Tooltip } from '../common/tooltip';

export function FileActions({ entry, menu = false, onAction }: {
  entry: FileEntry; menu?: boolean; onAction(type: SearchAction, id: string): void;
}) {
  const bookmark = entry.bookmarked ? 'ブックマーク解除' : 'ブックマークに追加';
  const sourceButton = <button type="button" role={menu ? 'menuitem' : undefined} aria-label={`${entry.label}のソースを開く`}
    onClick={event => { event.stopPropagation(); onAction('source', entry.id); }}>{menu ? 'ソースを開く' : '‹›'}</button>;
  const bookmarkButton = <button type="button" role={menu ? 'menuitem' : undefined} aria-label={`${entry.label}を${bookmark}`}
    aria-pressed={menu ? undefined : entry.bookmarked} onClick={event => { event.stopPropagation(); onAction('bookmark', entry.id); }}>{menu ? bookmark : entry.bookmarked ? '▣' : '▢'}</button>;
  return <>
    {menu ? sourceButton : <Tooltip text="VS Codeの標準エディターでソースを開く">{sourceButton}</Tooltip>}
    {menu ? bookmarkButton : <Tooltip text={bookmark}>{bookmarkButton}</Tooltip>}
  </>;
}
