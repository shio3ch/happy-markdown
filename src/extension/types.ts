import type * as vscode from 'vscode';
import type { SearchMatch } from '../shared/messages';

export interface ExplorerNode {
  label: string;
  uri: vscode.Uri;
  children?: ExplorerNode[];
  description?: string;
  matches?: SearchMatch[];
}

export interface SearchNode extends ExplorerNode {
  description: string;
  matches: SearchMatch[];
}

export type ResourceUri = (path: string) => string | vscode.Uri;
