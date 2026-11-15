import type { SearchResult, SearchAction } from '../../../shared/messages';
import { Excerpt } from './search-excerpt';

export function SearchResultCard({ result, term, onAction }: { result: SearchResult; term: string; onAction(type: SearchAction, id: string): void }) {
  return <article className={`result${result.active ? ' active' : ''}`}>
    <button type="button" className="open-result" title={result.path} data-id={result.id} data-action="open" onClick={() => onAction('open', result.id)}>
      <span className="result-heading"><span className="document-icon">{result.bookmarked ? '▣' : '▤'}</span><strong>{result.label}</strong><span className="count">{result.count}行</span>{result.active && <span className="active-label">表示中</span>}</span>
      <span className="path">{result.path}</span>
      {result.matches.map((match, index) => <Excerpt key={index} match={match} term={term} />)}
    </button>
    <div className="result-actions">
      <button type="button" data-id={result.id} data-action="bookmark" aria-pressed={result.bookmarked} onClick={() => onAction('bookmark', result.id)}>{result.bookmarked ? 'ブックマーク解除' : 'ブックマークに追加'}</button>
      <button type="button" data-id={result.id} data-action="source" onClick={() => onAction('source', result.id)}>ソースを開く</button>
    </div>
  </article>;
}
