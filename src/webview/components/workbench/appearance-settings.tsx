import { useEffect, useRef, useState } from 'react';
import { appearancePresets, backgroundPositions, isBackgroundImage } from '../../../shared/appearance';
import type { Appearance } from '../../../shared/appearance';
import type { AppearanceControls } from '../../hooks/use-appearance';

function Slider({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange(value: number): void;
}) {
  return <label className="appearance-slider"><span>{label}<output>{value}{unit}</output></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.target.value))} /></label>;
}

export function AppearanceSettings({ controls }: { controls: AppearanceControls }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState(''), [urlError, setUrlError] = useState('');
  const { theme, open, busy, message, change, select, close, request } = controls;
  useEffect(() => {
    if (!open || !dialog.current) return;
    const previous = document.activeElement;
    dialog.current.showModal();
    return () => {
      dialog.current?.close();
      if (previous instanceof HTMLElement) previous.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => { setUrl(theme.backgroundImage.startsWith('https:') ? theme.backgroundImage : ''); setUrlError(''); }, [theme.backgroundImage]);
  const update = <K extends keyof Appearance>(key: K, value: Appearance[K]) => change({ ...theme, [key]: value });
  const sliders = [
    ['fontSize', '本文サイズ', 12, 32, 1, 'px'], ['lineHeight', '行間', 1.3, 2.4, 0.05, ''],
    ['contentWidth', '本文の最大幅', 560, 1600, 20, 'px'], ['paragraphGap', '段落の余白', 0.5, 2.5, 0.05, 'em'],
    ['listIndent', 'リストの字下げ', 1.5, 3.5, 0.1, 'em'], ['listSpacing', '項目の間隔', 0, 1, 0.05, 'em'],
    ['markerSize', 'マーカーの大きさ', 1, 1.6, 0.05, '倍'],
  ] as const;
  return <dialog ref={dialog} id="appearance-settings" aria-labelledby="appearance-title" onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><small>HAPPY MARKDOWN</small><h2 id="appearance-title">外観のカスタマイズ</h2></div>
      <button type="button" aria-label="外観設定を閉じる" disabled={busy} onClick={close}>×</button></header>
    <p className="appearance-intro">サンプルと背後の文書にすぐに反映します。「適用」で、いつもの外観として保存できます。</p>
    <div className="appearance-layout"><div className="appearance-fields"><fieldset disabled={busy}>
      <legend>テーマ</legend><label>プリセット<select id="appearance-preset" value={theme.name} onChange={event => select(event.target.value)}>
        {appearancePresets.map(preset => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
        <option value="カスタム" disabled={!controls.hasCustom}>カスタム</option>
      </select></label><small>項目を変更すると「カスタム」に切り替わります。プリセットを試した後も「カスタム」から戻せます。</small>
    </fieldset><fieldset disabled={busy}><legend>文字とリズム</legend>
      <label>フォント<select value={theme.fontFamily} onChange={event => update('fontFamily', event.target.value as Appearance['fontFamily'])}>
        <option value="sans">ゴシック（標準）</option><option value="serif">明朝</option><option value="mono">等幅（VS Code設定）</option></select></label>
      {sliders.map(([key, label, min, max, step, unit]) => <Slider key={key} label={label} value={theme[key]} min={min} max={max} step={step} unit={unit} onChange={value => update(key, value)} />)}
      <label className="appearance-check"><input type="checkbox" checked={theme.guides} onChange={event => update('guides', event.target.checked)} />リストの階層ガイドを表示</label>
    </fieldset><fieldset disabled={busy}><legend>配色と見出し</legend>
      <label>明るさ<select value={theme.colorScheme} onChange={event => update('colorScheme', event.target.value as Appearance['colorScheme'])}>
        <option value="auto">VS Codeに追従</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label>
      {([['foreground', '文字色'], ['background', '背景色'], ['accent', 'アクセント色']] as const).map(([key, label]) => <div className="appearance-color" key={key}>
        <label>{label}<input type="color" aria-label={label} value={theme[key] || (key === 'foreground' ? '#24292f' : key === 'background' ? '#ffffff' : '#2563eb')} onChange={event => update(key, event.target.value)} /></label>
        <button type="button" onClick={() => update(key, '')}>{theme[key] ? 'VS Codeに戻す' : 'VS Codeに追従中'}</button></div>)}
      <label>見出しの装飾<select value={theme.headingStyle} onChange={event => update('headingStyle', event.target.value as Appearance['headingStyle'])}>
        <option value="plain">シンプル</option><option value="line">アクセントライン</option><option value="glow">ネオン</option></select></label>
    </fieldset><fieldset disabled={busy}><legend>背景画像</legend>
      <div className="appearance-actions"><button type="button" onClick={() => request('background')}>画像ファイルを選ぶ</button><button type="button" onClick={() => update('backgroundImage', '')}>画像を外す</button></div>
      <small>PNG・JPEG・WebP、2MBまで。JSONに画像も含めて保存できます。</small>
      <label>またはHTTPS画像URL<input type="url" value={url} placeholder="https://…" onChange={event => { setUrl(event.target.value); setUrlError(''); }} /></label>
      <button type="button" onClick={() => {
        if (url && (!url.startsWith('https:') || !isBackgroundImage(url))) { setUrlError('HTTPSの画像URLを入力してください。'); return; }
        update('backgroundImage', url);
      }}>URLを反映</button><span role="alert">{urlError}</span>
      <label>背景画像の配置<select id="appearance-background-position" value={theme.backgroundPosition}
        onChange={event => update('backgroundPosition', event.target.value as Appearance['backgroundPosition'])}>
        {backgroundPositions.map(position => <option key={position.value} value={position.value}>{position.label}</option>)}
      </select></label>
      <Slider label="背景画像の濃さ" value={theme.backgroundOpacity} min={0} max={0.4} step={0.01} unit="" onChange={value => update('backgroundOpacity', value)} />
    </fieldset><fieldset disabled={busy}><legend>テーマのファイル</legend>
      <div className="appearance-actions"><button type="button" onClick={() => request('import')}>インポート</button><button type="button" onClick={() => request('export')}>エクスポート</button></div>
      <small>読み込んだテーマも「適用」までは試着として表示します。</small>
    </fieldset></div><aside className="appearance-sample" aria-label="外観サンプル">
      <small>LIVE PREVIEW</small><h2>読みやすさを、あなたらしく。</h2>
      <p>文字の大きさと余白で、文章のリズムが変わります。</p>
      <ul><li>はっきりしたマーカー<ul><li>階層を追いやすい字下げ<ul><li>深いリストも見分けやすく</li></ul></li></ul></li><li>自分だけの配色と背景</li></ul>
      <blockquote>いつものノートを、心地よい場所に。</blockquote><p><a href="#" onClick={event => event.preventDefault()}>リンクのアクセント</a> と <code>inline code</code></p>
    </aside></div>
    <footer><span role="status">{busy ? '処理中…' : message}</span><div className="appearance-actions">
      <button type="button" disabled={busy} onClick={controls.reset}>初期値に戻す</button>
      <button type="button" disabled={busy} onClick={close}>キャンセル</button>
      <button type="button" className="appearance-apply" disabled={busy} onClick={() => request('save')}>適用</button>
    </div></footer>
  </dialog>;
}
