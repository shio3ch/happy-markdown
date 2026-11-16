import type { ExplorerMode } from '../../../shared/messages';
import { Icon } from '../common/icon';
import { Tooltip } from '../common/tooltip';

export function ExplorerNavigation({ mode, followActive, disabled, onMode, onRefresh, onFollow }: {
  mode: ExplorerMode; followActive: boolean; disabled: boolean;
  onMode(mode: ExplorerMode): void; onRefresh(): void; onFollow(enabled: boolean): void;
}) {
  return <nav className="explorer-navigation" aria-label="エクスプローラーの表示切り替え">
    {([['files', 'ファイル一覧', 'files'], ['search', '本文検索', 'search'], ['bookmarks', 'ブックマーク', 'bookmark']] as const).map(([value, label, icon]) =>
      <Tooltip key={value} text={`${label}を表示`}><button type="button" aria-label={label} aria-pressed={mode === value} disabled={disabled} onClick={() => onMode(value)}><Icon name={icon} /></button></Tooltip>)}
    <Tooltip text="ファイル一覧・検索結果を最新の状態に更新"><button type="button" aria-label="一覧を更新" disabled={disabled} onClick={onRefresh}><Icon name="refresh" /></button></Tooltip>
    <Tooltip className="follow-active" text={followActive ? '現在の文書への追従をオフにする' : '現在の文書への追従をオンにする'}>
      <button type="button" aria-label="現在の文書への追従" aria-pressed={followActive} disabled={disabled} onClick={() => onFollow(!followActive)}><Icon name={followActive ? 'eye' : 'eyeClosed'} /></button>
    </Tooltip>
  </nav>;
}
