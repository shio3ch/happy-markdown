import type { useDocumentSearch } from '../../hooks/use-document-search';

export function DocumentSearch({ search, hidden }: { search: ReturnType<typeof useDocumentSearch>; hidden: boolean }) {
  return <div className="document-search" role="search" hidden={hidden}>
    <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10" cy="10" r="6" /><path d="m15 15 6 6" /></svg>
    <input id="search" type="search" placeholder="本文を検索" aria-label="本文を検索" ref={search.input} value={search.term}
      onChange={event => search.setTerm(event.currentTarget.value)} onKeyDown={event => {
        if (event.key === 'Enter') { event.preventDefault(); search.navigate(event.shiftKey ? -1 : 1); }
        if (event.key === 'Escape') { search.setTerm(''); event.currentTarget.blur(); }
      }} />
    <span id="search-count" role="status">{search.term ? `${search.current + 1} / ${search.matches}` : ''}</span>
    <button id="search-prev" type="button" aria-label="前の一致" disabled={!search.matches} onClick={() => search.navigate(-1)}>↑</button>
    <button id="search-next" type="button" aria-label="次の一致" disabled={!search.matches} onClick={() => search.navigate(1)}>↓</button>
  </div>;
}
