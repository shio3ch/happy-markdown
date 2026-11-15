import { useRef } from 'react';

export function SearchBox({ query, disabled, onChange, onCompositionStart, onCompositionEnd }: {
  query: string; disabled: boolean; onChange(value: string): void; onCompositionStart(): void; onCompositionEnd(value: string): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return <div className="search-box" role="search"><label htmlFor="query">本文を検索</label><div className="input-row">
    <input id="query" type="search" ref={input} disabled={disabled} placeholder="検索する言葉を入力" autoComplete="off" spellCheck={false} aria-describedby="search-help"
      value={query} onChange={event => onChange(event.currentTarget.value)} onCompositionStart={onCompositionStart}
      onCompositionEnd={event => onCompositionEnd(event.currentTarget.value)} />
    <button id="clear" type="button" title="検索語をクリア" aria-label="検索語をクリア" onClick={() => { onChange(''); input.current?.focus(); }}>×</button>
  </div><p id="search-help">全Markdownから検索 · 大文字・小文字を区別しない</p></div>;
}
