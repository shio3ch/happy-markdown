import { searchDocuments } from './workspace-search';
import { registerExplorerView } from './explorer-view';
import type { ExplorerMode } from '../shared/messages';
export { findMatches } from './workspace-search';
import type * as VSCode from 'vscode';
import type { ExplorerNode } from './types';

interface FolderNode extends ExplorerNode { children: ExplorerNode[]; folders: Map<string, FolderNode> }

// Build only the folder paths that contain Markdown files.
export function buildTree(files: readonly VSCode.Uri[], folders: readonly VSCode.WorkspaceFolder[], api: typeof VSCode): ExplorerNode[] {
  const roots: FolderNode[] = folders.map(folder => ({ label: folder.name, uri: folder.uri, children: [], folders: new Map() }));
  for (const uri of files) {
    const folder = api.workspace.getWorkspaceFolder(uri);
    const root = roots.find(item => item.uri.toString() === folder?.uri.toString());
    if (!root) continue;
    const relative = uri.path.slice(root.uri.path.replace(/\/$/, '').length + 1);
    const parts = relative.split('/');
    let parent = root;
    for (const part of parts.slice(0, -1)) {
      if (!parent.folders.has(part)) {
        const child = { label: part, uri: api.Uri.joinPath(parent.uri, part), children: [], folders: new Map() };
        parent.folders.set(part, child);
        parent.children.push(child);
      }
      parent = parent.folders.get(part)!;
    }
    parent.children.push({ label: parts.at(-1)!, uri });
  }
  const sort = (nodes: ExplorerNode[]): ExplorerNode[] => {
    nodes.sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.label.localeCompare(b.label, undefined, { numeric: true }));
    nodes.forEach(node => { if (node.children) sort(node.children); });
    return nodes;
  };
  sort(roots);
  return roots.length === 1 ? roots[0].children : roots;
}

function findNodePath(nodes: ExplorerNode[], key: string): ExplorerNode[] | undefined {
  for (const node of nodes) {
    if (node.uri.toString() === key) return [node];
    const children = node.children && findNodePath(node.children, key);
    if (children) return [node, ...children];
  }
}

export function registerExplorer(context: VSCode.ExtensionContext, vscode: typeof VSCode) {
  const bookmarkKey = 'happyMarkdown.bookmarks', followKey = 'happyMarkdown.followActive';
  const stored = context.workspaceState.get<unknown>(bookmarkKey, []);
  let bookmarks = new Set<string>(Array.isArray(stored) ? stored.filter(value => typeof value === 'string') : []);
  let followActive = context.workspaceState.get<unknown>(followKey, true) !== false;
  let bookmarkWrites = Promise.resolve(), followWrites = Promise.resolve();
  const expandedFolders = new Set<string>();
  let mode: ExplorerMode = 'files', query = '', requestId = 0, generation = 0, publication = 0, disposed = false;
  let nodes: ExplorerNode[] = [], status = '', busy = false, revealId: string | undefined, revealRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined, queryTimer: ReturnType<typeof setTimeout> | undefined;
  let cached: ReturnType<typeof load> | undefined;
  let activeUri = activeResource();
  const pattern = '**/*.{md,markdown,MD,MARKDOWN}';
  function activeResource() {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (!(input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom)) return;
    return /\.(md|markdown)$/i.test(input.uri.path) ? input.uri.toString() : undefined;
  }
  const panel = registerExplorerView(context, vscode, {
    ready: () => publish(true), refresh, mode: selectMode, follow: setFollowActive,
    query(value, id) {
      query = value; requestId = id; generation++; publication++; cached = undefined;
      clearTimeout(queryTimer);
      if (mode === 'search') {
        nodes = []; status = query ? '検索中…' : '検索語を入力してください。'; busy = Boolean(query);
        queryTimer = setTimeout(() => { if (mode === 'search') void publish(); }, 100);
      }
      render();
    },
    expand(node, expanded) {
      const id = node.uri.toString();
      if (expanded) expandedFolders.add(id); else expandedFolders.delete(id);
      render();
    },
    action(type, node) {
      if (type === 'bookmark') return changeBookmark(node, !bookmarks.has(node.uri.toString()));
      return open(node.uri, type === 'source');
    },
  });
  function render() {
    if (disposed) return;
    panel.render({ mode, query, requestId, status, busy, bookmarks: [...bookmarks], expandedIds: [...expandedFolders],
      activeUri: followActive ? activeUri : undefined, followActive, revealId, revealRevision, hasWorkspace: Boolean(vscode.workspace.workspaceFolders?.length) }, nodes);
  }
  async function load() {
    const version = generation, selectedMode = mode, term = query;
    const current = () => !disposed && version === generation;
    try {
      const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,.cache}/**');
      if (!current()) return { nodes: [], status: '' };
      if (selectedMode === 'files') return { nodes: buildTree(files, vscode.workspace.workspaceFolders || [], vscode),
        status: files.length ? '' : 'Markdownファイルが見つかりません。.md または .markdown ファイルを追加してください。' };
      if (selectedMode === 'search') {
        const result = await searchDocuments(vscode, files.sort((a, b) => a.path.localeCompare(b.path)), { text: term }, current);
        return { nodes: result.nodes, status: !term ? '検索語を入力してください。' : `${result.nodes.length}ファイル一致${result.failed ? `（${result.failed}ファイルを読み込めませんでした）` : ''}` };
      }
      const saved = files.filter(uri => bookmarks.has(uri.toString())).sort((a, b) => a.path.localeCompare(b.path))
        .map(uri => ({ label: uri.path.split('/').at(-1)!, uri, description: vscode.workspace.asRelativePath(uri, true) }));
      return { nodes: saved, status: saved.length ? `${saved.length}件のブックマーク` : 'ファイルのブックマークアイコンから登録できます。' };
    } catch (error) {
      if (current()) {
        cached = undefined;
        void vscode.window.showWarningMessage(`Markdown一覧を取得できませんでした: ${error instanceof Error ? error.message : String(error)}`);
      }
      return { nodes: [], status: '一覧を取得できませんでした。上部の更新から再試行してください。' };
    }
  }
  async function publish(reveal = false) {
    const version = generation, request = ++publication;
    busy = true; render();
    if (!cached) cached = load();
    const result = await cached;
    if (disposed || version !== generation || request !== publication) return;
    nodes = result.nodes; status = result.status; busy = false;
    if (reveal) revealId = undefined;
    if (reveal && followActive && panel.visible && mode !== 'search' && activeUri) {
      const path = findNodePath(nodes, activeUri);
      revealId = path?.at(-1)?.uri.toString();
      if (path) {
        path.slice(0, -1).forEach(node => expandedFolders.add(node.uri.toString()));
        revealRevision++;
      }
    }
    render();
  }
  function refresh() {
    generation++; cached = undefined; clearTimeout(queryTimer);
    return publish(true);
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 150); };
  function activeChanged() {
    const next = activeResource();
    if (activeUri === next) return;
    activeUri = next;
    return publish(true);
  }
  function selectMode(next: ExplorerMode) {
    mode = next; nodes = []; status = ''; revealId = undefined;
    void vscode.commands.executeCommand('setContext', 'happyMarkdown.explorerMode', mode);
    return refresh();
  }
  function changeBookmark(node: Pick<ExplorerNode, 'uri' | 'children'> | undefined, add: boolean) {
    if (!node?.uri || node.children) return;
    const value = node.uri.toString();
    bookmarkWrites = bookmarkWrites.then(async () => {
      const next = new Set(bookmarks);
      if (add) next.add(value); else next.delete(value);
      await context.workspaceState.update(bookmarkKey, [...next]);
      bookmarks = next;
      if (!disposed) await refresh();
    }).catch(error => { void vscode.window.showWarningMessage(`ブックマークを保存できませんでした: ${error instanceof Error ? error.message : String(error)}`); });
    return bookmarkWrites;
  }
  function setFollowActive(enabled: boolean) {
    followWrites = followWrites.then(async () => {
      await context.workspaceState.update(followKey, enabled);
      followActive = enabled; revealId = undefined;
      await vscode.commands.executeCommand('setContext', followKey, followActive);
      if (!disposed) await publish(true);
    }).catch(error => { void vscode.window.showWarningMessage(`文書への追従設定を保存できませんでした: ${error instanceof Error ? error.message : String(error)}`); });
    return followWrites;
  }
  function open(uri: VSCode.Uri, source = false) {
    return vscode.commands.executeCommand('vscode.openWith', uri, source ? 'default' : 'happyMarkdown.preview', { viewColumn: vscode.ViewColumn.Active, preview: true });
  }
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  context.subscriptions.push(watcher,
    vscode.window.tabGroups.onDidChangeTabs(activeChanged), vscode.window.tabGroups.onDidChangeTabGroups(activeChanged),
    watcher.onDidCreate(schedule), watcher.onDidDelete(schedule), watcher.onDidChange(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidChangeTextDocument(event => { if (mode === 'search' && /\.(md|markdown)$/i.test(event.document.uri.path)) schedule(); }),
    vscode.commands.registerCommand('happyMarkdown.enableFollowActive', () => setFollowActive(true)),
    vscode.commands.registerCommand('happyMarkdown.disableFollowActive', () => setFollowActive(false)),
    vscode.commands.registerCommand('happyMarkdown.showFiles', () => selectMode('files')),
    vscode.commands.registerCommand('happyMarkdown.showSearch', () => selectMode('search')),
    vscode.commands.registerCommand('happyMarkdown.showBookmarks', () => selectMode('bookmarks')),
    vscode.commands.registerCommand('happyMarkdown.addBookmark', (node?: ExplorerNode) => changeBookmark(node, true)),
    vscode.commands.registerCommand('happyMarkdown.removeBookmark', (node?: ExplorerNode) => changeBookmark(node, false)),
    vscode.commands.registerCommand('happyMarkdown.refreshExplorer', refresh),
    vscode.commands.registerCommand('happyMarkdown.openDocument', (uri?: VSCode.Uri) => { if (uri) return open(uri); }),
    vscode.commands.registerCommand('happyMarkdown.openSource', (node?: ExplorerNode) => { if (node?.uri) return open(node.uri, true); }),
    { dispose() { disposed = true; generation++; publication++; clearTimeout(timer); clearTimeout(queryTimer); } },
  );
  void vscode.commands.executeCommand('setContext', 'happyMarkdown.explorerMode', mode);
  void vscode.commands.executeCommand('setContext', followKey, followActive);
}
