import { Icon } from '../common/icon';

export function ModeSwitch({ mode, disabled, onSwitch }: { mode: 'edit' | 'preview'; disabled: boolean; onSwitch(): void }) {
  return <button id="mode" type="button" disabled={disabled} aria-pressed={mode === 'edit'}
    title={mode === 'edit' ? 'プレビューへ切り替え' : 'テキスト編集へ切り替え'} onClick={onSwitch}>
    <Icon name="pencil" /><span id="mode-label">{mode === 'edit' ? 'プレビュー' : '編集する'}</span>
  </button>;
}
