import type { ExplorerMode } from '../../../shared/messages';
import { Icon } from '../common/icon';

export function ExplorerNavigation({ mode, followActive, disabled, onMode, onRefresh, onFollow }: {
  mode: ExplorerMode; followActive: boolean; disabled: boolean;
  onMode(mode: ExplorerMode): void; onRefresh(): void; onFollow(enabled: boolean): void;
}) {
  return <nav className="explorer-navigation" aria-label="エクスプローラーの表示切り替え">
    {([['files', 'ファイル一覧', 'files'], ['search', '本文検索', 'search'], ['bookmarks', 'ブックマーク', 'bookmark']] as const).map(([value, label, icon]) =>
      <button type="button" key={value} title={label} aria-label={label} aria-pressed={mode === value} disabled={disabled} onClick={() => onMode(value)}><Icon name={icon} /></button>)}
    <button type="button" title="一覧を更新" aria-label="一覧を更新" disabled={disabled} onClick={onRefresh}><Icon name="refresh" /></button>
    <button type="button" className="follow-active" title={followActive ? '現在の文書への追従をオフ' : '現在の文書への追従をオン'}
      aria-label="現在の文書への追従" aria-pressed={followActive} disabled={disabled} onClick={() => onFollow(!followActive)}><Icon name={followActive ? 'eye' : 'eyeClosed'} /></button>
  </nav>;
}
