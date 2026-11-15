import * as vscode from 'vscode';
import { isEditorMessage } from '../shared/messages';
import type { DocumentSnapshot, ImageResult } from '../shared/messages';
import type { Task } from './markdown';
import { registerExplorer } from './explorer';
import { renderMarkdown, taskEdit } from './markdown';
import { textChange } from './text-change';
import { pickImage } from './images';
import { shell } from './shell';

export function activate(context: vscode.ExtensionContext) {
  registerExplorer(context, vscode);
  const viewType = 'happyMarkdown.preview';
  context.subscriptions.push(vscode.commands.registerCommand('happyMarkdown.openPreview', async (uri?: vscode.Uri) => {
    const resource = uri || vscode.window.activeTextEditor?.document.uri;
    if (resource) await vscode.commands.executeCommand('vscode.openWith', resource, viewType, { viewColumn: vscode.ViewColumn.Active, preview: false });
  }));
  context.subscriptions.push(vscode.window.registerCustomEditorProvider(viewType, {
    resolveCustomTextEditor(document, panel) {
      const webview = panel.webview;
      webview.options = { enableScripts: true, localResourceRoots: [context.extensionUri, vscode.Uri.joinPath(document.uri, '..')] };
      webview.html = shell(webview, path => webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, path)));
      let tasks = new Map<string, Task>(), disposed = false, applying = false;
      let operations = Promise.resolve();
      const update = (extra: Partial<Pick<DocumentSnapshot, 'id' | 'rejected' | 'message'>> = {}) => {
        if (disposed) return;
        const rendered = renderMarkdown(document.getText(), {
          imageUri: value => {
            if (/^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//')) return value;
            try { return webview.asWebviewUri(vscode.Uri.parse(new URL(value, document.uri.toString()).href)).toString(); }
            catch { return ''; }
          },
        });
        tasks = rendered.tasks;
        void webview.postMessage({ type: 'snapshot', text: document.getText().replace(/\r\n/g, '\n'), html: rendered.html,
          version: document.version, dirty: document.isDirty, ...extra } satisfies DocumentSnapshot);
      };
      const apply = async (change: vscode.WorkspaceEdit, extra: Partial<Pick<DocumentSnapshot, 'id' | 'rejected' | 'message'>>) => {
        applying = true;
        try {
          const applied = await vscode.workspace.applyEdit(change);
          update({ ...extra, rejected: !applied, message: applied ? '' : '変更を反映できませんでした。書き込み権限を確認してください。' });
        } catch {
          update({ ...extra, rejected: true, message: '変更を反映できませんでした。入力内容は画面に保持しています。' });
        } finally { applying = false; }
      };
      const handle = async (message: unknown) => {
        if (disposed || !isEditorMessage(message)) return;
        if (message.type === 'ready') return update();
        if (message.type === 'edit') {
          if (typeof message.text !== 'string' || !Number.isSafeInteger(message.id)) return;
          if (message.version !== document.version) return update({ id: message.id, rejected: true });
          const text = document.eol === vscode.EndOfLine.CRLF ? message.text.replace(/\r?\n/g, '\r\n') : message.text;
          const delta = textChange(document.getText(), text);
          if (!delta) return update({ id: message.id });
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, new vscode.Range(document.positionAt(delta.start), document.positionAt(delta.end)), delta.text);
          return apply(edit, { id: message.id });
        }
        if (message.type === 'pickImage') {
          try {
            const result = await pickImage(vscode, document);
            if (!disposed) await webview.postMessage({type:'imageResult', ...result} satisfies ImageResult);
          } catch {
            if (!disposed) await webview.postMessage({type:'imageResult', message:'画像を追加できませんでした。ファイルや保存先の権限を確認してください。'} satisfies ImageResult);
          }
          return;
        }
        if (message.type === 'save') {
          const saved = await document.save();
          return update({ message: saved ? '保存しました。' : '保存できませんでした。' });
        }
        if (message.type === 'undo' || message.type === 'redo') {
          // A hidden editor must never undo a different active document.
          if (panel.active !== false) await vscode.commands.executeCommand(message.type);
          return update();
        }
        if (message.type === 'toggle') {
          const task = taskEdit(tasks, message, document.version, line => document.lineAt(line).text);
          if (!task) return update({ message: '文書が更新されたため、もう一度チェックしてください。' });
          const edit = new vscode.WorkspaceEdit();
          edit.replace(document.uri, new vscode.Range(task.line, task.character, task.line, task.character + 1), task.text);
          return apply(edit, {});
        }
        if (message.type === 'link' && typeof message.href === 'string') {
          try {
            const target = vscode.Uri.parse(new URL(message.href, document.uri.toString()).href);
            if (['https', 'http', 'mailto'].includes(target.scheme)) await vscode.env.openExternal(target);
            else if (target.scheme === document.uri.scheme && ['file', 'vscode-remote'].includes(target.scheme)) {
              await vscode.commands.executeCommand(/\.(md|markdown)$/i.test(target.path) ? 'vscode.openWith' : 'vscode.open', target,
                ...(/\.(md|markdown)$/i.test(target.path) ? [viewType] : []));
            }
          } catch { update({ message: 'リンクを開けませんでした。' }); }
        }
      };
      const subscriptions = [
        vscode.workspace.onDidChangeTextDocument(event => {
          if (!applying && event.document.uri.toString() === document.uri.toString()) update();
        }),
        vscode.workspace.onDidSaveTextDocument(saved => { if (saved.uri.toString() === document.uri.toString()) update(); }),
        webview.onDidReceiveMessage((message: unknown) => {
          operations = operations.then(() => handle(message)).catch(() => update({ id: isEditorMessage(message) && message.type === 'edit' ? message.id : undefined, rejected: true, message: '操作を完了できませんでした。' }));
          return operations;
        }),
      ];
      panel.onDidDispose(() => { disposed = true; subscriptions.forEach(item => item.dispose()); });
    },
  }, { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }));
}
