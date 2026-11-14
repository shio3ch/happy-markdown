import { searchDocuments } from './workspace-search';
import { registerSearchView } from './explorer-search';
export { findMatches } from './workspace-search';
import type * as VSCode from 'vscode';
import type { ExplorerNode, SearchNode } from './types';

interface FolderNode extends ExplorerNode { children: ExplorerNode[]; folders: Map<string, FolderNode> }
type ExplorerMode = 'files' | 'search' | 'bookmarks';

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
  const emitter = new vscode.EventEmitter<ExplorerNode | undefined>();
  const bookmarkKey = 'happyMarkdown.bookmarks';
  const stored = context.workspaceState.get<unknown>(bookmarkKey, []);
  let bookmarks = new Set(Array.isArray(stored) ? stored.filter(value => typeof value === 'string') : []);
  let bookmarkWrites = Promise.resolve();
  const followKey = 'happyMarkdown.followActive';
  let followActive = context.workspaceState.get<unknown>(followKey, true) !== false;
  let followWrites = Promise.resolve();
  const expandedFolders = new Set<string>();
  const icon = (name: string) => ({
    light: vscode.Uri.joinPath(context.extensionUri, 'media', 'explorer', 'light', `${name}.svg`),
    dark: vscode.Uri.joinPath(context.extensionUri, 'media', 'explorer', 'dark', `${name}.svg`),
  });
  let mode: ExplorerMode = 'files', query = '', requestId = 0, searchFailed = 0, searchError = false, generation = 0, disposed = false;
  let cached: Promise<ExplorerNode[]> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined, queryTimer: ReturnType<typeof setTimeout> | undefined;
  let searchNodes: ExplorerNode[] = [];
  let activeUri = activeResource();
  let selectionVersion = 0, revealQueue = Promise.resolve();
  function activeResource() {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    if (!(input instanceof vscode.TabInputText || input instanceof vscode.TabInputCustom)) return;
    return /\.(md|markdown)$/i.test(input.uri.path) ? input.uri.toString() : undefined;
  }
  function roots() {
    if (!cached) cached = load();
    return cached;
  }
  function syncActive() {
    const request = ++selectionVersion, version = generation, target = activeUri;
    // Hidden views must not be opened by automatic selection.
    if (disposed || mode === 'search' || !followActive || view.visible === false || !target) return Promise.resolve();
    const pending = roots();
    revealQueue = revealQueue.then(async () => {
      const nodes = await pending;
      if (disposed || !followActive || request !== selectionVersion || version !== generation || view.visible === false) return;
      const path = findNodePath(nodes, target);
      if (path) await view.reveal(path.at(-1)!, { select: true, focus: false, expand: false });
    }).catch(() => { /* A refresh or view disposal can invalidate a pending reveal. */ });
    return revealQueue;
  }
  function activeChanged() {
    const next = activeResource();
    if (activeUri === next) return;
    activeUri = next;
    emitter.fire(undefined);
    if (mode === 'search') void publishSearch();
    return syncActive();
  }
  const view = vscode.window.createTreeView<ExplorerNode>('happyMarkdown.explorer', { treeDataProvider: {
    onDidChangeTreeData: emitter.event,
    getChildren(node) {
      if (node) return node.children || [];
      return roots();
    },
    async getParent(node) {
      const path = findNodePath(await roots(), node.uri.toString());
      return path && path.length > 1 ? path.at(-2) : undefined;
    },
    getTreeItem(node) {
      const marked = bookmarks.has(node.uri.toString());
      const expanded = expandedFolders.has(node.uri.toString());
      const item = new vscode.TreeItem(node.label, node.children
        ? expanded ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None);
      item.id = node.uri.toString();
      item.resourceUri = node.uri;
      item.tooltip = node.matches ? node.matches.map(match => `${match.line}: ${match.text}`).join('\n') : node.uri.fsPath;
      item.description = followActive && !node.children && node.uri.toString() === activeUri
        ? ['表示中', node.description].filter(Boolean).join(' — ') : node.description;
      item.iconPath = icon(node.children ? expanded ? 'folder-open' : 'folder' : marked ? 'document-bookmarked' : 'document');
      if (node.children) item.description = `${node.children.length}項目`;
      item.contextValue = node.children ? 'markdownFolder' : marked ? 'bookmarkedMarkdownFile' : 'markdownFile';
      if (!node.children) item.command = { command: 'happyMarkdown.openDocument', title: '本文を開く', arguments: [node.uri] };
      return item;
    },
  } });
  const refresh = () => { generation++; cached = undefined; emitter.fire(undefined); void syncActive(); if (mode === 'search') void publishSearch(); };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
  const pattern = '**/*.{md,markdown,MD,MARKDOWN}';
  function updateHeading(message: string | undefined) {
    view.description = { files: 'ファイル一覧', search: '検索', bookmarks: 'ブックマーク' }[mode];
    view.message = message;
  }
  async function load(): Promise<ExplorerNode[]> {
    const version = generation, selectedMode = mode, term = query;
    const current = () => !disposed && version === generation;
    try {
      const files = await vscode.workspace.findFiles(pattern, '**/{node_modules,.git,.cache}/**');
      if (!current()) return [];
      if (selectedMode === 'files') {
        updateHeading(files.length ? undefined : 'Markdownファイルが見つかりません。.md または .markdown ファイルを追加してください。');
        return buildTree(files, vscode.workspace.workspaceFolders || [], vscode);
      }
      if (selectedMode === 'search') {
        const result = await searchDocuments(vscode, files.sort((a, b) => a.path.localeCompare(b.path)), { text: term }, current);
        if (!current()) return [];
        searchFailed = result.failed;
        searchError = false;
        return result.nodes;
      }
      const nodes = files.filter(uri => bookmarks.has(uri.toString())).sort((a, b) => a.path.localeCompare(b.path))
        .map(uri => ({ label: uri.path.split('/').at(-1)!, uri, description: vscode.workspace.asRelativePath(uri, true) }));
      updateHeading(nodes.length ? `${nodes.length}件のブックマーク` : 'ファイルのブックマークアイコンから登録できます。');
      return nodes;
    } catch (error) {
      if (current()) {
        cached = undefined;
        searchError = true;
        updateHeading('一覧を取得できませんでした。上部の更新から再試行してください。');
        vscode.window.showWarningMessage(`Markdown一覧を取得できませんでした: ${error instanceof Error ? error.message : String(error)}`);
      }
      return [];
    }
  }
  const selectMode = (next: ExplorerMode) => {
    mode = next;
    updateHeading(undefined);
    refresh();
    return vscode.commands.executeCommand('setContext', 'happyMarkdown.explorerMode', mode);
  };
  function renderSearch(nodes: ExplorerNode[], status: string, busy = false) {
    searchNodes = nodes;
    searchPanel.render({ query, requestId, status, busy, bookmarks: [...bookmarks], activeUri: followActive ? activeUri : undefined }, nodes.filter((node): node is SearchNode => !!node.matches && node.description !== undefined));
  }
  async function publishSearch() {
    const version = generation;
    renderSearch(searchNodes, query ? '検索中…' : '検索語を入力してください。', Boolean(query));
    const nodes = await roots();
    if (disposed || mode !== 'search' || version !== generation) return;
    renderSearch(nodes, searchError ? '検索できませんでした。上部の更新から再試行してください。'
      : !query ? '検索語を入力してください。' : `${nodes.length}ファイル一致${searchFailed ? `（${searchFailed}ファイルを読み込めませんでした）` : ''}`);
  }
  const changeBookmark = (node: Pick<ExplorerNode, 'uri' | 'children'> | undefined, add: boolean) => {
    if (!node?.uri || node.children) return;
    const value = node.uri.toString();
    bookmarkWrites = bookmarkWrites.then(async () => {
      const next = new Set(bookmarks);
      if (add) next.add(value); else next.delete(value);
      await context.workspaceState.update(bookmarkKey, [...next]);
      bookmarks = next;
      if (!disposed) refresh();
    }).catch(error => { void vscode.window.showWarningMessage(`ブックマークを保存できませんでした: ${error instanceof Error ? error.message : String(error)}`); });
    return bookmarkWrites;
  };
  const setFollowActive = (enabled: boolean) => {
    followWrites = followWrites.then(async () => {
      await context.workspaceState.update(followKey, enabled);
      followActive = enabled;
      selectionVersion++;
      await vscode.commands.executeCommand('setContext', followKey, followActive);
      if (!disposed) {
        emitter.fire(undefined);
        void syncActive();
        if (mode === 'search') void publishSearch();
      }
    }).catch(error => { void vscode.window.showWarningMessage(`文書への追従設定を保存できませんでした: ${error instanceof Error ? error.message : String(error)}`); });
    return followWrites;
  };
  const searchPanel = registerSearchView(context, vscode, {
    query(value, id) {
      query = value;
      requestId = id;
      generation++;
      cached = undefined;
      clearTimeout(queryTimer);
      renderSearch([], query ? '検索中…' : '検索語を入力してください。', Boolean(query));
      queryTimer = setTimeout(() => { if (mode === 'search') void publishSearch(); }, 100);
    },
    action(type, node) {
      if (type === 'bookmark') return changeBookmark(node, !bookmarks.has(node.uri.toString()));
      if (type === 'source') return vscode.commands.executeCommand('vscode.openWith', node.uri, 'default');
      return vscode.commands.executeCommand('vscode.openWith', node.uri, 'happyMarkdown.preview', { viewColumn: vscode.ViewColumn.Active, preview: true });
    },
  });
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  updateHeading(undefined);
  context.subscriptions.push(emitter, view, watcher,
    vscode.window.tabGroups.onDidChangeTabs(activeChanged),
    vscode.window.tabGroups.onDidChangeTabGroups(activeChanged),
    view.onDidChangeVisibility(() => { void syncActive(); }),
    view.onDidExpandElement(({ element }) => {
      expandedFolders.add(element.uri.toString());
      emitter.fire(element);
    }),
    view.onDidCollapseElement(({ element }) => {
      expandedFolders.delete(element.uri.toString());
      emitter.fire(element);
    }),
    watcher.onDidCreate(schedule), watcher.onDidDelete(schedule), watcher.onDidChange(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidChangeTextDocument(event => {
      if (mode === 'search' && /\.(md|markdown)$/i.test(event.document.uri.path)) schedule();
    }),
    vscode.commands.registerCommand('happyMarkdown.enableFollowActive', () => setFollowActive(true)),
    vscode.commands.registerCommand('happyMarkdown.disableFollowActive', () => setFollowActive(false)),
    vscode.commands.registerCommand('happyMarkdown.showFiles', () => selectMode('files')),
    vscode.commands.registerCommand('happyMarkdown.showSearch', () => selectMode('search')),
    vscode.commands.registerCommand('happyMarkdown.showBookmarks', () => selectMode('bookmarks')),
    vscode.commands.registerCommand('happyMarkdown.addBookmark', (node?: ExplorerNode) => changeBookmark(node, true)),
    vscode.commands.registerCommand('happyMarkdown.removeBookmark', (node?: ExplorerNode) => changeBookmark(node, false)),
    vscode.commands.registerCommand('happyMarkdown.refreshExplorer', refresh),
    vscode.commands.registerCommand('happyMarkdown.openDocument', (uri?: VSCode.Uri) => {
      if (uri) return vscode.commands.executeCommand('vscode.openWith', uri, 'happyMarkdown.preview', { viewColumn: vscode.ViewColumn.Active, preview: true });
    }),
    vscode.commands.registerCommand('happyMarkdown.openSource', (node?: ExplorerNode) => {
      if (node?.uri) return vscode.commands.executeCommand('vscode.openWith', node.uri, 'default');
    }),
    { dispose() { disposed = true; generation++; selectionVersion++; clearTimeout(timer); clearTimeout(queryTimer); } },
  );
  void vscode.commands.executeCommand('setContext', 'happyMarkdown.explorerMode', mode);
  void vscode.commands.executeCommand('setContext', followKey, followActive);
  void syncActive();
}
