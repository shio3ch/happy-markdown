import type * as VSCode from 'vscode';
import type { ExplorerNode } from './types';
import type { FileOperation } from '../shared/messages';

const markdown = /\.(md|markdown)$/i;
export const excludedFolders = new Set(['node_modules', '.git', '.cache']);

// Include empty directories without following links outside the workspace.
export async function workspaceDirectories(api: typeof VSCode, current = () => true) {
  const directories: VSCode.Uri[] = [];
  let failed = 0;
  async function visit(parent: VSCode.Uri) {
    if (!current()) return;
    let entries: [string, VSCode.FileType][];
    try { entries = await api.workspace.fs.readDirectory(parent); }
    catch { failed++; return; }
    for (const [name, type] of entries) {
      if (!current()) return;
      if (type !== api.FileType.Directory || excludedFolders.has(name)) continue;
      const uri = api.Uri.joinPath(parent, name);
      directories.push(uri);
      await visit(uri);
    }
  }
  for (const root of api.workspace.workspaceFolders || []) await visit(root.uri);
  return { directories, failed };
}

export class ExplorerFiles {
  private clipboard?: { uri: VSCode.Uri; cut: boolean; text: string };
  private pending = Promise.resolve();
  constructor(private readonly api: typeof VSCode, private readonly changed: (from?: VSCode.Uri, to?: VSCode.Uri, created?: VSCode.Uri) => Promise<unknown>, private readonly clipboardChanged: () => unknown = () => changed()) {}
  get cutId() { return this.clipboard?.cut ? this.clipboard.uri.toString() : undefined; }
  get canPaste() { return Boolean(this.clipboard); }
  run(action: FileOperation | 'move' | 'cancelCut', node?: ExplorerNode, target?: ExplorerNode) {
    const task = this.pending.then(async () => {
      try { await this.perform(action, node, target); }
      catch (error) { await this.api.window.showWarningMessage(`ファイル操作を完了できませんでした: ${error instanceof Error ? error.message : String(error)}`); }
    });
    this.pending = task;
    return task;
  }
  private async exists(uri: VSCode.Uri) {
    try { await this.api.workspace.fs.stat(uri); return true; }
    catch (error) { if ((error as { code?: string }).code === 'FileNotFound') return false; throw error; }
  }
  private same(a: VSCode.Uri, b: VSCode.Uri) { return a.toString() === b.toString(); }
  private contains(parent: VSCode.Uri, child: VSCode.Uri) {
    return this.same(parent, child) || child.toString().startsWith(parent.toString().replace(/\/$/, '') + '/');
  }
  private root(uri: VSCode.Uri) {
    return this.api.workspace.workspaceFolders?.find(root => uri.scheme === root.uri.scheme && uri.authority === root.uri.authority &&
      (uri.path === root.uri.path || uri.path.startsWith(root.uri.path.replace(/\/$/, '') + '/')));
  }
  private async validate(uri: VSCode.Uri, allowRoot = false) {
    const root = this.root(uri);
    if (!root || (!allowRoot && this.same(uri, root.uri))) throw new Error('ワークスペース内の項目を選んでください。');
    let parent = uri;
    while (!this.same(parent, root.uri)) {
      if (excludedFolders.has(parent.path.split('/').at(-1)!)) throw new Error('このフォルダーは操作対象外です。');
      if ((await this.api.workspace.fs.stat(parent)).type & this.api.FileType.SymbolicLink) throw new Error('シンボリックリンクは操作対象外です。');
      parent = this.api.Uri.joinPath(parent, '..');
    }
  }
  private async destination(node?: ExplorerNode) {
    if (node) {
      const uri = node.children ? node.uri : this.api.Uri.joinPath(node.uri, '..');
      await this.validate(uri, true);
      return uri;
    }
    const roots = this.api.workspace.workspaceFolders || [];
    if (roots.length === 1) { await this.validate(roots[0].uri, true); return roots[0].uri; }
    const chosen = await this.api.window.showQuickPick(roots.map(root => ({ label: root.name, uri: root.uri })), { placeHolder: '作成・貼り付け先のフォルダー' });
    if (chosen) await this.validate(chosen.uri, true);
    return chosen?.uri;
  }
  private async name(value: string, folder: boolean) {
    const validateInput = (name: string) => {
      if (!name.trim() || name === '.' || name === '..' || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name)) return '区切り文字や末尾の空白・ピリオドを含まない名前を入力してください。';
      if (excludedFolders.has(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return 'この名前は使用できません。';
      if (!folder && !markdown.test(name)) return '.md または .markdown の拡張子を付けてください。';
      return undefined;
    };
    const name = await this.api.window.showInputBox({ prompt: folder ? 'フォルダー名' : 'Markdownファイル名', value, valueSelection: [0, !folder && value.lastIndexOf('.') > 0 ? value.lastIndexOf('.') : value.length], validateInput });
    if (name === undefined) return;
    const error = validateInput(name);
    if (error) throw new Error(error);
    return name;
  }
  private async apply(edit: VSCode.WorkspaceEdit) {
    if (!await this.api.workspace.applyEdit(edit)) throw new Error('変更を反映できませんでした。元の項目は保持されています。');
  }
  private async available(parent: VSCode.Uri, name: string) {
    const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let n = 1; n < 10000; n++) {
      const uri = this.api.Uri.joinPath(parent, `${stem} のコピー${n === 1 ? '' : ` (${n})`}${ext}`);
      if (!await this.exists(uri)) return uri;
    }
    throw new Error('複製先の名前を決められませんでした。');
  }
  private async copy(source: VSCode.Uri, target: VSCode.Uri) {
    await this.validate(source);
    await this.validate(this.api.Uri.joinPath(target, '..'), true);
    const document = this.api.workspace.textDocuments.find(doc => this.same(doc.uri, source));
    const contents = document?.isDirty ? Buffer.from(document.getText(), 'utf8') : await this.api.workspace.fs.readFile(source);
    const edit = new this.api.WorkspaceEdit();
    edit.createFile(target, { overwrite: false, contents });
    await this.apply(edit);
  }
  private async move(source: VSCode.Uri, target: VSCode.Uri) {
    if (this.same(source, target)) return;
    if (target.path.startsWith(source.path.replace(/\/$/, '') + '/')) throw new Error('自分自身の配下には移動できません。');
    await this.validate(this.api.Uri.joinPath(target, '..'), true);
    if (await this.exists(target)) throw new Error('移動先に同じ名前の項目があります。');
    const edit = new this.api.WorkspaceEdit();
    edit.renameFile(source, target, { overwrite: false });
    await this.apply(edit);
    if (this.clipboard && this.contains(source, this.clipboard.uri)) this.clipboard = undefined;
    await this.changed(source, target);
  }
  private async perform(action: FileOperation | 'move' | 'cancelCut', node?: ExplorerNode, target?: ExplorerNode) {
    const api = this.api;
    if (action === 'cancelCut') {
      if (this.clipboard?.cut) { this.clipboard = undefined; await this.clipboardChanged(); }
      return;
    }
    if (action === 'newFile' || action === 'newFolder') {
      const parent = await this.destination(node);
      if (!parent) return;
      const folder = action === 'newFolder', name = await this.name(folder ? '新しいフォルダー' : '無題.md', folder);
      if (!name) return;
      await this.validate(parent, true);
      const uri = api.Uri.joinPath(parent, name);
      if (await this.exists(uri)) throw new Error('同じ名前の項目が存在します。');
      if (folder) await api.workspace.fs.createDirectory(uri);
      else { const edit = new api.WorkspaceEdit(); edit.createFile(uri, { overwrite: false }); await this.apply(edit); }
      await this.changed(undefined, undefined, uri);
      if (!folder) await api.commands.executeCommand('vscode.openWith', uri, 'happyMarkdown.preview', { preview: false });
      return;
    }
    if (action === 'paste') {
      const clipboard = this.clipboard;
      if (!clipboard) return;
      if (await api.env.clipboard.readText() !== clipboard.text) { this.clipboard = undefined; await this.clipboardChanged(); return; }
      const parent = await this.destination(node);
      if (!parent) return;
      await this.validate(clipboard.uri);
      if (clipboard.cut) {
        const destination = api.Uri.joinPath(parent, clipboard.uri.path.split('/').at(-1)!);
        if (this.same(clipboard.uri, destination)) { this.clipboard = undefined; await this.clipboardChanged(); }
        else await this.move(clipboard.uri, destination);
      } else {
        const name = clipboard.uri.path.split('/').at(-1)!;
        let uri = api.Uri.joinPath(parent, name);
        if (await this.exists(uri)) uri = await this.available(parent, name);
        await this.copy(clipboard.uri, uri);
        await this.changed();
      }
      return;
    }
    if (!node) return;
    await this.validate(node.uri, action === 'copyPath' || action === 'copyRelativePath');
    if (action === 'copyPath' || action === 'copyRelativePath') {
      await api.env.clipboard.writeText(action === 'copyPath' ? node.uri.fsPath : api.workspace.asRelativePath(node.uri, (api.workspace.workspaceFolders?.length || 0) > 1));
      this.clipboard = undefined;
      await this.clipboardChanged();
    } else if (action === 'copy' || action === 'cut') {
      if (node.children) return;
      const text = node.uri.fsPath;
      await api.env.clipboard.writeText(text);
      this.clipboard = { uri: node.uri, cut: action === 'cut', text };
      await this.clipboardChanged();
    } else if (action === 'duplicate') {
      if (node.children) return;
      await this.copy(node.uri, await this.available(api.Uri.joinPath(node.uri, '..'), node.label));
      await this.changed();
    } else if (action === 'rename') {
      const name = await this.name(node.label, Boolean(node.children));
      if (name) { await this.validate(node.uri); await this.move(node.uri, api.Uri.joinPath(node.uri, '..', name)); }
    } else if (action === 'move') {
      if (node.children || (target && !target.children)) return;
      const parent = await this.destination(target);
      if (parent) { await this.validate(node.uri); await this.move(node.uri, api.Uri.joinPath(parent, node.label)); }
    } else if (action === 'delete') {
      const dirty = () => api.workspace.textDocuments.some(doc => doc.isDirty && this.contains(node.uri, doc.uri));
      if (dirty()) throw new Error('未保存の文書があります。保存してから削除してください。');
      const answer = await api.window.showWarningMessage(`「${node.label}」を削除しますか？${node.children ? 'フォルダー内のすべての項目も削除します。' : ''}`, { modal: true }, '削除');
      if (answer !== '削除') return;
      await this.validate(node.uri);
      if (dirty()) throw new Error('未保存の文書があります。保存してから削除してください。');
      const edit = new api.WorkspaceEdit();
      edit.deleteFile(node.uri, { recursive: Boolean(node.children), ignoreIfNotExists: false });
      await this.apply(edit);
      if (this.clipboard && this.contains(node.uri, this.clipboard.uri)) this.clipboard = undefined;
      await this.changed();
    }
  }
}
