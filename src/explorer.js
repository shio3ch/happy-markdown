'use strict';

// Build only the folder paths that contain Markdown files.
function buildTree(files, folders, api) {
  const roots = folders.map(folder => ({ label: folder.name, uri: folder.uri, children: [], folders: new Map() }));
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
      parent = parent.folders.get(part);
    }
    parent.children.push({ label: parts.at(-1), uri });
  }
  const sort = nodes => {
    nodes.sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.label.localeCompare(b.label, undefined, { numeric: true }));
    nodes.forEach(node => { if (node.children) sort(node.children); });
    return nodes;
  };
  sort(roots);
  return roots.length === 1 ? roots[0].children : roots;
}

function registerExplorer(context, vscode) {
  const emitter = new vscode.EventEmitter();
  let cached;
  let timer;
  const refresh = () => { cached = undefined; emitter.fire(); };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 150); };
  const pattern = '**/*.{md,markdown,MD,MARKDOWN}';
  const provider = {
    onDidChangeTreeData: emitter.event,
    getChildren(node) {
      if (node) return node.children || [];
      if (!cached) cached = vscode.workspace.findFiles(pattern, '**/{node_modules,.git,.cache}/**')
        .then(files => buildTree(files, vscode.workspace.workspaceFolders || [], vscode))
        .catch(error => { cached = undefined; vscode.window.showWarningMessage(`Markdown一覧を取得できませんでした: ${error.message}`); return []; });
      return cached;
    },
    getTreeItem(node) {
      const item = new vscode.TreeItem(node.label, node.children ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
      item.id = node.uri.toString();
      item.resourceUri = node.uri;
      item.tooltip = node.uri.fsPath;
      item.iconPath = new vscode.ThemeIcon(node.children ? 'folder' : 'markdown');
      item.contextValue = node.children ? 'markdownFolder' : 'markdownFile';
      if (!node.children) item.command = { command: 'happyMarkdown.openDocument', title: '本文を開く', arguments: [node.uri] };
      return item;
    },
  };
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  context.subscriptions.push(emitter, watcher,
    watcher.onDidCreate(schedule), watcher.onDidDelete(schedule),
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.window.registerTreeDataProvider('happyMarkdown.explorer', provider),
    vscode.commands.registerCommand('happyMarkdown.refreshExplorer', refresh),
    vscode.commands.registerCommand('happyMarkdown.openDocument', uri => {
      if (uri) return vscode.commands.executeCommand('vscode.openWith', uri, 'happyMarkdown.preview', { viewColumn: vscode.ViewColumn.Active, preview: true });
    }),
    vscode.commands.registerCommand('happyMarkdown.openSource', node => {
      if (node?.uri) return vscode.commands.executeCommand('vscode.openWith', node.uri, 'default');
    }),
    { dispose() { clearTimeout(timer); } },
  );
}

module.exports = { buildTree, registerExplorer };
