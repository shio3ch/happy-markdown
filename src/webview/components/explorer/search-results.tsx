import type { SearchAction, SearchResult } from '../../../shared/messages';
import { SearchResultCard } from './search-result-card';

export function SearchResults({ results, query, busy, onAction }: {
  results: SearchResult[]; query: string; busy: boolean; onAction(type: SearchAction, id: string): void;
}) {
  return <div id="results" aria-label="検索結果" aria-busy={busy}>
    {results.map(result => <SearchResultCard key={result.id} result={result} term={query} onAction={onAction} />)}
  </div>;
}
