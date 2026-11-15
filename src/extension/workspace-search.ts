import type * as VSCode from 'vscode';
import type { SearchMatch } from '../shared/messages';
import type { SearchNode } from './types';

export function findMatches(text: string, query: string): SearchMatch[] {
  const needle = query.toLocaleLowerCase();
  if (!needle) return [];
  return text.split(/\r?\n/).flatMap((line, index) => {
    const match = line.toLocaleLowerCase().indexOf(needle);
    if (match < 0) return [];
    const start = Math.max(0, match - 60);
    return [{ line: index + 1, text: `${start ? '…' : ''}${line.slice(start, start + Math.max(180, Math.min(needle.length, 500))).trim()}` }];
  });
}

// Keep criteria separate from the sidebar UI so metadata conditions can be added here.
export async function searchDocuments(vscode: typeof VSCode, files: VSCode.Uri[], criteria: { text: string }, isCurrent: () => boolean) {
  const nodes: SearchNode[] = [];
  let failed = 0;
  if (!criteria.text) return { nodes, failed };
  for (const uri of files) {
    if (!isCurrent()) return { nodes: [], failed: 0 };
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const matches = findMatches(document.getText(), criteria.text);
      if (matches.length) nodes.push({ label: uri.path.split('/').at(-1)!, uri,
        description: vscode.workspace.asRelativePath(uri, true), matches });
    } catch { failed++; }
  }
  return { nodes, failed };
}
