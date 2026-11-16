import { useEffect, useLayoutEffect, useState } from 'react';
import { appearancePresets, defaultAppearance, isAppearanceResult, normalizeAppearance } from '../../shared/appearance';
import type { Appearance, AppearanceProfile } from '../../shared/appearance';
import type { EditorMessage } from '../../shared/messages';

const families = {
  sans: 'system-ui, -apple-system, "Segoe UI", "Noto Sans JP", sans-serif',
  serif: '"Yu Mincho", "Hiragino Mincho ProN", serif',
  mono: 'var(--vscode-editor-font-family, monospace)',
};
interface AppearanceState extends AppearanceProfile { backgroundUri: string; customBackgroundUri?: string }
function withTheme(current: AppearanceState, theme: Appearance, backgroundUri: string): AppearanceState {
  return { ...current, theme, backgroundUri, ...(theme.name === 'カスタム' ? { custom: theme, customBackgroundUri: backgroundUri } : {}) };
}
export function useAppearance(send: (message: EditorMessage) => void) {
  const [saved, setSaved] = useState<AppearanceState>({ theme: defaultAppearance, backgroundUri: '' });
  const [draft, setDraft] = useState<AppearanceState>();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const current = draft || saved;
  const { theme, backgroundUri } = current;
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const result = event.data;
      if (!isAppearanceResult(result)) return;
      if (result.action !== 'load') { setBusy(false); setMessage(result.message || ''); }
      if (!result.theme) return;
      const theme = normalizeAppearance(result.theme);
      if (result.action === 'load' || result.action === 'save') {
        setSaved(withTheme({ theme, backgroundUri: result.backgroundUri || '', custom: result.custom,
          customBackgroundUri: result.customBackgroundUri }, theme, result.backgroundUri || ''));
        if (result.action === 'save') setDraft(undefined);
      } else if (result.action === 'import') {
        setDraft(current => current ? withTheme(current, theme, result.backgroundUri || '') : undefined);
      } else if (result.action === 'background') {
        setDraft(current => current ? withTheme(current,
          { ...current.theme, name: 'カスタム', backgroundImage: theme.backgroundImage }, result.backgroundUri || '') : undefined);
      }
    };
    window.addEventListener('message', receive);
    send({ type: 'appearance', action: 'load' });
    return () => window.removeEventListener('message', receive);
  }, [send]);
  useLayoutEffect(() => {
    const style = document.createElement('style');
    style.nonce = document.querySelector<HTMLMetaElement>('meta[name="style-nonce"]')?.content || '';
    const fg = theme.foreground || (theme.colorScheme === 'light' ? '#24292f' : theme.colorScheme === 'dark' ? '#d9e0ee' : 'var(--vscode-editor-foreground, #24292f)');
    const bg = theme.background || (theme.colorScheme === 'light' ? '#ffffff' : theme.colorScheme === 'dark' ? '#161b22' : 'var(--vscode-editor-background, #fff)');
    const accent = theme.accent || (theme.colorScheme === 'light' ? '#2563eb' : theme.colorScheme === 'dark' ? '#7bb6ff' : 'var(--vscode-textLink-foreground, #2563eb)');
    // 値は共有スキーマで制限済み。任意のCSSは挿入しない。背景URIはホストが解決する。
    style.textContent = `body.workbench {
      --reading-font-size:${theme.fontSize}px; --design-font-family:${families[theme.fontFamily]};
      --design-line-height:${theme.lineHeight}; --design-block-gap:${theme.paragraphGap}em;
      --document-width:${theme.contentWidth}px; --reading-indent:${theme.listIndent}em;
      --reading-list-gap:${theme.listSpacing}em; --reading-marker-size:${theme.markerSize}em;
      --reading-marker-scale:${theme.markerSize};
      --reading-guides:${theme.guides ? '1px' : '0px'}; --reading-foreground:${fg}; --reading-background:${bg};
      --reading-accent:${accent}; --reading-surface:color-mix(in srgb, ${bg} 92%, ${fg});
      --reading-border:color-mix(in srgb, ${bg} 78%, ${fg});
      --reading-image:${backgroundUri ? `url("${backgroundUri}")` : 'none'};
      --reading-image-position:${theme.backgroundPosition};
      --reading-overlay:${(1 - theme.backgroundOpacity) * 100}%;
    }`;
    document.head.append(style);
    document.body.dataset.headingStyle = theme.headingStyle;
    document.body.dataset.readingScheme = theme.colorScheme;
    return () => style.remove();
  }, [theme, backgroundUri]);
  return {
    theme, hasCustom: Boolean(current.custom), open: Boolean(draft), busy, message,
    show: () => { setDraft({ ...saved }); setMessage(''); },
    close: () => { if (!busy) { setDraft(undefined); setMessage(''); } },
    reset: () => { if (!busy) { setDraft({ theme: defaultAppearance, backgroundUri: '' }); setMessage(''); } },
    change: (next: Appearance) => {
      if ((Object.keys(theme) as (keyof Appearance)[]).every(key => key === 'name' || theme[key] === next[key])) return;
      const uri = next.backgroundImage === theme.backgroundImage ? backgroundUri : next.backgroundImage.startsWith('https:') ? next.backgroundImage : '';
      setDraft(withTheme(current, { ...next, name: 'カスタム' }, uri));
    },
    select: (name: string) => {
      const next = name === 'カスタム' ? current.custom : appearancePresets.find(preset => preset.name === name);
      if (next) setDraft({ ...current, theme: next, backgroundUri: name === 'カスタム' ? current.customBackgroundUri || '' : '' });
    },
    request: (action: 'save' | 'export' | 'import' | 'background') => {
      if (busy) return;
      setBusy(true); setMessage('');
      if (action === 'save') send({ type: 'appearance', action, theme, custom: current.custom || null });
      else send(action === 'export' ? { type: 'appearance', action, theme } : { type: 'appearance', action });
    },
  };
}
export type AppearanceControls = ReturnType<typeof useAppearance>;
