import type { SearchMatch } from '../../../shared/messages';

export function Excerpt({ match, term }: { match: SearchMatch; term: string }) {
  const offset = match.text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase());
  return <span className="excerpt"><span className="line-number">{match.line}</span><span>
    {offset < 0 || !term ? match.text : <>{match.text.slice(0, offset)}<mark>{match.text.slice(offset, offset + term.length)}</mark>{match.text.slice(offset + term.length)}</>}
  </span></span>;
}
