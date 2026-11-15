import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { DocumentSnapshot } from '../../shared/messages';
import { highlightMatches, selectMatch } from '../preview-search';

export function useDocumentSearch(root: RefObject<HTMLElement | null>, snapshot?: DocumentSnapshot) {
  const input = useRef<HTMLInputElement>(null), previousTerm = useRef('');
  const [term, setTerm] = useState(''), [matches, setMatches] = useState(0), [current, setCurrent] = useState(-1);
  useLayoutEffect(() => {
    if (!root.current) return;
    const count = highlightMatches(root.current, term);
    setMatches(count); setCurrent(count ? 0 : -1);
    selectMatch(root.current, count ? 0 : -1, previousTerm.current !== term);
    previousTerm.current = term;
  }, [root, snapshot, term]);
  const navigate = (step: number) => {
    const next = matches ? (current + step + matches) % matches : -1;
    setCurrent(next);
    if (root.current) selectMatch(root.current, next);
  };
  return { input, term, setTerm, matches, current, navigate };
}
