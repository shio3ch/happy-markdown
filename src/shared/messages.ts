import { isAppearanceRequest } from './appearance';
import type { AppearanceRequest } from './appearance';
// このモジュールは拡張ホストとWebviewの両方から参照するため、環境固有のAPIを持たない。
export type DocumentAction = 'save' | 'undo' | 'redo';
export type EditorMessage = AppearanceRequest
  | { type: 'ready' | 'pickImage' | DocumentAction }
  | { type: 'edit'; id: number; version: number; text: string }
  | { type: 'toggle'; id: string; version: number; checked: boolean }
  | { type: 'link'; href: string };

export interface DocumentSnapshot {
  type: 'snapshot';
  text: string;
  html: string;
  version: number;
  dirty: boolean;
  id?: number;
  rejected?: boolean;
  message?: string;
}

export interface ImageResult {
  type: 'imageResult';
  path?: string;
  message?: string;
}

export interface SearchMatch { line: number; text: string }
export type SearchAction = 'open' | 'source' | 'bookmark';
export type SearchMessage =
  | { type: 'ready' }
  | { type: 'query'; value: string; requestId: number }
  | { type: SearchAction; id: string };

export interface SearchResult {
  id: string;
  label: string;
  path: string;
  count: number;
  matches: SearchMatch[];
  bookmarked: boolean;
  active: boolean;
}

export interface SearchState {
  type: 'state';
  busy: boolean;
  query: string;
  requestId: number;
  status: string;
  results: SearchResult[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isEditorMessage(value: unknown): value is EditorMessage {
  if (!isRecord(value)) return false;
  if (isAppearanceRequest(value)) return true;
  switch (value.type) {
    case 'ready': case 'pickImage': case 'save': case 'undo': case 'redo': return true;
    case 'edit': return isVersion(value.id) && isVersion(value.version) && typeof value.text === 'string';
    case 'toggle': return typeof value.id === 'string' && isVersion(value.version) && typeof value.checked === 'boolean';
    case 'link': return typeof value.href === 'string';
    default: return false;
  }
}

export function isSearchMessage(value: unknown): value is SearchMessage {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'ready': return true;
    case 'query': return typeof value.value === 'string' && isVersion(value.requestId);
    case 'open': case 'source': case 'bookmark': return typeof value.id === 'string';
    default: return false;
  }
}

export function isDocumentSnapshot(value: unknown): value is DocumentSnapshot {
  return isRecord(value) && value.type === 'snapshot' && typeof value.text === 'string' &&
    typeof value.html === 'string' && isVersion(value.version) && typeof value.dirty === 'boolean' &&
    (value.id === undefined || isVersion(value.id)) &&
    (value.rejected === undefined || typeof value.rejected === 'boolean') &&
    (value.message === undefined || typeof value.message === 'string');
}

export function isImageResult(value: unknown): value is ImageResult {
  return isRecord(value) && value.type === 'imageResult' &&
    (value.path === undefined || typeof value.path === 'string') &&
    (value.message === undefined || typeof value.message === 'string');
}

export function isSearchState(value: unknown): value is SearchState {
  return isRecord(value) && value.type === 'state' && typeof value.busy === 'boolean' &&
    typeof value.query === 'string' && isVersion(value.requestId) && typeof value.status === 'string' &&
    Array.isArray(value.results) && value.results.every(result => isRecord(result) &&
      typeof result.id === 'string' && typeof result.label === 'string' && typeof result.path === 'string' &&
      isVersion(result.count) && typeof result.bookmarked === 'boolean' && typeof result.active === 'boolean' &&
      Array.isArray(result.matches) && result.matches.every(match => isRecord(match) &&
        isVersion(match.line) && typeof match.text === 'string'));
}

export type ExplorerPlatform = 'mac' | 'windows' | 'linux';
export type ExplorerMode = 'files' | 'search' | 'bookmarks';
export type FileOperation = 'newFile' | 'newFolder' | 'duplicate' | 'copy' | 'cut' | 'paste' | 'copyPath' | 'copyRelativePath' | 'rename' | 'delete';
export type ExplorerAction = SearchAction | 'openTab' | 'openSide' | 'openPreview';
export type ExplorerMessage = SearchMessage
  | { type: 'openTab' | 'openSide' | 'openPreview'; id: string }
  | { type: 'selection'; id?: string }
  | { type: 'treeFocus'; focused: boolean }
  | { type: 'fileOperation'; action: FileOperation; id?: string }
  | { type: 'move'; id: string; targetId?: string }
  | { type: 'mode'; mode: ExplorerMode }
  | { type: 'expand'; id: string; expanded: boolean }
  | { type: 'follow'; enabled: boolean }
  | { type: 'refresh' | 'openFolder' };
export interface FileEntry {
  id: string;
  label: string;
  path: string;
  bookmarked: boolean;
  active: boolean;
  icon: { light: string; dark: string };
  children?: FileEntry[];
  root?: boolean;
}
export interface ExplorerState extends SearchState {
  mode: ExplorerMode;
  platform?: ExplorerPlatform;
  nodes: FileEntry[];
  expandedIds: string[];
  followActive: boolean;
  hasWorkspace: boolean;
  cutId?: string;
  canPaste?: boolean;
  revealId?: string;
  revealRevision: number;
}
export function isExplorerMode(value: unknown): value is ExplorerMode {
  return value === 'files' || value === 'search' || value === 'bookmarks';
}
export function isExplorerMessage(value: unknown): value is ExplorerMessage {
  if (isSearchMessage(value)) return true;
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'openTab': case 'openSide': case 'openPreview': return typeof value.id === 'string';
    case 'treeFocus': return typeof value.focused === 'boolean';
    case 'selection': return value.id === undefined || typeof value.id === 'string';
    case 'fileOperation': return typeof value.action === 'string' && ['newFile', 'newFolder', 'duplicate', 'copy', 'cut', 'paste', 'copyPath', 'copyRelativePath', 'rename', 'delete'].includes(value.action) &&
      (value.id === undefined ? ['newFile', 'newFolder', 'paste'].includes(value.action) : typeof value.id === 'string');
    case 'move': return typeof value.id === 'string' && (value.targetId === undefined || typeof value.targetId === 'string');
    case 'mode': return isExplorerMode(value.mode);
    case 'expand': return typeof value.id === 'string' && typeof value.expanded === 'boolean';
    case 'follow': return typeof value.enabled === 'boolean';
    case 'refresh': case 'openFolder': return true;
    default: return false;
  }
}
function isFileEntries(value: unknown): value is FileEntry[] {
  if (!Array.isArray(value)) return false;
  const pending: unknown[] = [...value], seen = new Set<unknown>(), ids = new Set<string>();
  while (pending.length) {
    const node = pending.pop();
    if (!isRecord(node) || seen.has(node) || typeof node.id !== 'string' || ids.has(node.id) ||
        typeof node.label !== 'string' || typeof node.path !== 'string' || typeof node.bookmarked !== 'boolean' ||
        typeof node.active !== 'boolean' || !isRecord(node.icon) || typeof node.icon.light !== 'string' || typeof node.icon.dark !== 'string') return false;
    seen.add(node); ids.add(node.id);
    if (node.root !== undefined && typeof node.root !== 'boolean') return false;
    if (node.children !== undefined) {
      if (!Array.isArray(node.children)) return false;
      node.children.forEach(child => pending.push(child));
    }
  }
  return true;
}
export function isExplorerState(value: unknown): value is ExplorerState {
  return isRecord(value) && isSearchState(value) && isExplorerMode(value.mode) &&
    isFileEntries(value.nodes) &&
    (value.platform === undefined || value.platform === 'mac' || value.platform === 'windows' || value.platform === 'linux') &&
    Array.isArray(value.expandedIds) && value.expandedIds.every(id => typeof id === 'string') &&
    typeof value.followActive === 'boolean' && typeof value.hasWorkspace === 'boolean' &&
    (value.cutId === undefined || typeof value.cutId === 'string') && (value.canPaste === undefined || typeof value.canPaste === 'boolean') &&
    (value.revealId === undefined || typeof value.revealId === 'string') && isVersion(value.revealRevision);
}

export interface ExplorerFocus { type: 'focusTree'; id?: string }
export function isExplorerFocus(value: unknown): value is ExplorerFocus {
  return isRecord(value) && value.type === 'focusTree' && (value.id === undefined || typeof value.id === 'string');
}

export interface ExplorerTreeCommand { type: 'treeCommand'; command: 'contextMenu' | 'toggleFolder' }
export function isExplorerTreeCommand(value: unknown): value is ExplorerTreeCommand {
  return isRecord(value) && value.type === 'treeCommand' && (value.command === 'contextMenu' || value.command === 'toggleFolder');
}
