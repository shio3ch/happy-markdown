'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { explorerHarness, uri } = require('./explorer-harness');
const operation = (h, action, id) => h.receive({ type: 'fileOperation', action, id });
const id = path => `file:///docs/${path}`;

test('creates Markdown and empty folders, opens a pinned tab and retains empty folders on refresh', async () => {
  const h = explorerHarness();
  try {
    await h.ready();
    h.inputs.push('空フォルダー'); await operation(h, 'newFolder');
    const folder = h.current.nodes.find(node => node.label === '空フォルダー');
    assert.deepEqual(folder.children, []);
    h.inputs.push('日本語.markdown'); await operation(h, 'newFile', folder.id);
    assert.equal(h.texts.get('/docs/空フォルダー/日本語.markdown'), '');
    assert.equal(h.edits.at(-1).entries[0].options.overwrite, false);
    assert.equal(h.executed.at(-1)[1].path, '/docs/空フォルダー/日本語.markdown');
    assert.equal(h.executed.at(-1)[3].preview, false);
    await h.commands.get('happyMarkdown.refreshExplorer')();
    assert.equal(h.current.nodes[0].children[0].label, '日本語.markdown');
    await h.receive({ type: 'openTab', id: id('first.md') });
    assert.equal(h.executed.at(-1)[3].preview, false);
    await h.receive({ type: 'open', id: id('second.markdown') });
    assert.equal(h.executed.at(-1)[3].preview, true);
  } finally { h.dispose(); }
});

test('rejects conflicts, invalid names, unknown IDs, symbolic links and workspace-root mutation', async () => {
  const h = explorerHarness();
  try {
    await h.ready();
    for (const name of ['../outside.md', '..', 'a/b.md', '.git', 'bad.txt', 'bad.md ', 'CON.md', '']) {
      h.inputs.push(name); await operation(h, 'newFile');
    }
    h.inputs.push('first.md'); await operation(h, 'newFile');
    assert.equal(h.edits.length, 0); assert.equal(h.files.length, 2);
    await operation(h, 'delete', 'file:///outside/file.md');
    await h.receive({ type: 'move', id: id('first.md'), targetId: 'file:///outside' });
    await operation(h, 'newFolder', 'file:///forged');
    assert.equal(h.edits.length, 0);
    h.files.push(uri('/docs/link/file.md')); h.texts.set('/docs/link/file.md', 'linked'); h.links.add('/docs/link');
    await h.commands.get('happyMarkdown.refreshExplorer')();
    await operation(h, 'duplicate', id('link/file.md'));
    assert.equal(h.edits.length, 0); assert.match(h.warnings.at(-1), /シンボリックリンク/);
    h.vscode.workspace.workspaceFolders.push({ name: 'second', uri: uri('/second') });
    h.directories.add('/second'); await h.commands.get('happyMarkdown.refreshExplorer')();
    h.answers.push('削除'); await operation(h, 'delete', 'file:///docs');
    assert.equal(h.edits.length, 0); assert.match(h.warnings.at(-1), /ワークスペース/);
  } finally { h.dispose(); }
});

test('duplicates to a unique sibling using dirty TextDocument content and preserves original bytes otherwise', async () => {
  const h = explorerHarness();
  try {
    await h.ready();
    h.documents.push({ uri: uri('/docs/first.md'), isDirty: true, getText: () => '未保存\r\n本文' });
    await operation(h, 'duplicate', id('first.md')); await operation(h, 'duplicate', id('first.md'));
    assert.equal(h.texts.get('/docs/first のコピー.md'), '未保存\r\n本文');
    assert.equal(h.texts.get('/docs/first のコピー (2).md'), '未保存\r\n本文');
    assert.equal(h.texts.get('/docs/first.md'), '検索対象\nHELLO unsaved');
    h.texts.set('/docs/second.markdown', '\ufeffCRLF\r\n');
    await operation(h, 'duplicate', id('second.markdown'));
    assert.equal(h.texts.get('/docs/second のコピー.markdown'), '\ufeffCRLF\r\n');
  } finally { h.dispose(); }
});

test('copies, cuts and pastes files, reflects clipboard paths, and clears cuts only after successful moves', async () => {
  const h = explorerHarness();
  try {
    h.directories.add('/docs/target'); await h.ready();
    await operation(h, 'copy', id('first.md'));
    assert.equal(h.clipboard, '/docs/first.md'); assert.equal(h.current.canPaste, true);
    await operation(h, 'paste', id('target'));
    assert.equal(h.texts.get('/docs/target/first.md'), h.texts.get('/docs/first.md'));
    await operation(h, 'cut', id('first.md'));
    assert.equal(h.current.cutId, id('first.md'));
    await operation(h, 'paste', id('target'));
    assert.match(h.warnings.at(-1), /同じ名前/); assert.equal(h.current.cutId, id('first.md'));
    assert.ok(h.texts.has('/docs/first.md'));
    h.inputs.push('other.md'); await operation(h, 'rename', id('target/first.md'));
    await operation(h, 'paste', id('target'));
    assert.equal(h.texts.has('/docs/first.md'), false); assert.equal(h.current.cutId, undefined); assert.equal(h.current.canPaste, false);
    await operation(h, 'copy', id('second.markdown')); h.clipboard = '他のアプリのコピー';
    await operation(h, 'paste', id('target'));
    assert.equal(h.texts.has('/docs/target/second.markdown'), false); assert.equal(h.current.canPaste, false);
    await operation(h, 'copyPath', id('target/first.md')); assert.equal(h.clipboard, '/docs/target/first.md');
    h.vscode.workspace.asRelativePath = file => file.path.slice('/docs/'.length);
    await operation(h, 'copyRelativePath', id('target/first.md')); assert.equal(h.clipboard, 'target/first.md');
  } finally { h.dispose(); }
});

test('moves known files into folders or the workspace root and preserves dirty documents and bookmark locations', async () => {
  const h = explorerHarness([id('first.md')]);
  try {
    h.directories.add('/docs/target'); await h.ready();
    const doc = { uri: uri('/docs/first.md'), isDirty: true, getText: () => 'unsaved' }; h.documents.push(doc);
    await h.receive({ type: 'move', id: id('first.md'), targetId: id('target') });
    assert.equal(doc.uri.path, '/docs/target/first.md'); assert.equal(doc.getText(), 'unsaved');
    assert.equal(h.edits.at(-1).entries[0].type, 'rename');
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [id('target/first.md')]);
    await h.receive({ type: 'move', id: id('target/first.md') });
    assert.ok(h.texts.has('/docs/first.md'));
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [id('first.md')]);
    h.inputs.push('second.markdown'); await operation(h, 'rename', id('first.md'));
    assert.match(h.warnings.at(-1), /同じ名前/); assert.ok(h.texts.has('/docs/first.md'));
    h.vscode.workspace.applyEdit = async () => false;
    h.inputs.push('失敗.md'); await operation(h, 'rename', id('first.md'));
    assert.ok(h.texts.has('/docs/first.md')); assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [id('first.md')]);
    assert.match(h.warnings.at(-1), /反映できませんでした/);
  } finally { h.dispose(); }
});

test('renames folders with descendants and expansion and confirms deletion while protecting dirty documents', async () => {
  const h = explorerHarness([id('nested/a.md')]);
  try {
    h.files.push(uri('/docs/nested/a.md')); h.texts.set('/docs/nested/a.md', 'a'); await h.ready();
    await h.receive({ type: 'expand', id: id('nested'), expanded: true });
    h.inputs.push('renamed'); await operation(h, 'rename', id('nested'));
    assert.ok(h.texts.has('/docs/renamed/a.md')); assert.ok(h.current.expandedIds.includes(id('renamed')));
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [id('renamed/a.md')]);
    await operation(h, 'delete', id('renamed')); // Cancel.
    assert.ok(h.texts.has('/docs/renamed/a.md'));
    const doc = { uri: uri('/docs/renamed/a.md'), isDirty: true }; h.documents.push(doc);
    await operation(h, 'delete', id('renamed')); assert.match(h.warnings.at(-1), /未保存/);
    doc.isDirty = false;
    h.answers.push('削除'); await operation(h, 'delete', id('renamed'));
    assert.equal(h.texts.has('/docs/renamed/a.md'), false);
    assert.equal(h.edits.at(-1).entries[0].options.recursive, true);
  } finally { h.dispose(); }
});

test('cancels naming without mutations and serializes simultaneous duplicate requests', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await operation(h, 'newFile'); await operation(h, 'rename', id('first.md'));
    assert.equal(h.edits.length, 0);
    await Promise.all([operation(h, 'duplicate', id('first.md')), operation(h, 'duplicate', id('first.md'))]);
    assert.ok(h.texts.has('/docs/first のコピー.md')); assert.ok(h.texts.has('/docs/first のコピー (2).md'));
  } finally { h.dispose(); }
});

test('VS Code rename events and their inverse keep bookmarks and expansion aligned', async () => {
  const h = explorerHarness([id('nested/a.md')]);
  try {
    h.files.push(uri('/docs/nested/a.md')); h.texts.set('/docs/nested/a.md', 'a'); await h.ready();
    await h.receive({ type: 'expand', id: id('nested'), expanded: true });
    h.files[h.files.length - 1] = uri('/docs/renamed/a.md');
    await h.callbacks.rename({ files: [{ oldUri: uri('/docs/nested'), newUri: uri('/docs/renamed') }] });
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [id('renamed/a.md')]); assert.ok(h.current.expandedIds.includes(id('renamed')));
    h.files[h.files.length - 1] = uri('/docs/nested/a.md');
    await h.callbacks.rename({ files: [{ oldUri: uri('/docs/renamed'), newUri: uri('/docs/nested') }] });
    assert.deepEqual(h.state.get('happyMarkdown.bookmarks'), [id('nested/a.md')]); assert.ok(h.current.expandedIds.includes(id('nested')));
  } finally { h.dispose(); }
});

test('directory enumeration ignores excluded and linked folders and preserves the list when one directory is unreadable', async () => {
  const h = explorerHarness();
  try {
    h.directories.add('/docs/empty'); h.directories.add('/docs/.git'); h.directories.add('/docs/node_modules'); h.directories.add('/docs/blocked'); h.links.add('/docs/link');
    const read = h.vscode.workspace.fs.readDirectory;
    h.vscode.workspace.fs.readDirectory = async parent => { if (parent.path === '/docs/blocked') throw new Error('access denied'); return read(parent); };
    await h.ready();
    assert.deepEqual(h.current.nodes.map(node => node.label), ['blocked', 'empty', 'first.md', 'second.markdown']);
    assert.match(h.current.status, /1フォルダーを読み込めません/);
  } finally { h.dispose(); }
});

test('pasting a cut file into its own folder clears the cut without changing any files', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await operation(h, 'cut', id('first.md')); await operation(h, 'paste');
    assert.equal(h.current.cutId, undefined); assert.equal(h.current.canPaste, false);
    assert.equal(h.edits.length, 0); assert.equal(h.files.length, 2);
  } finally { h.dispose(); }
});

test('multiple workspace roots choose the destination and a cancelled picker makes no change', async () => {
  const h = explorerHarness();
  try {
    h.vscode.workspace.workspaceFolders.push({ name: 'other', uri: uri('/other') }); h.directories.add('/other');
    h.vscode.workspace.getWorkspaceFolder = file => h.vscode.workspace.workspaceFolders.find(folder => file.path === folder.uri.path || file.path.startsWith(folder.uri.path + '/'));
    await h.ready();
    h.vscode.window.showQuickPick = async () => undefined;
    await operation(h, 'newFolder'); assert.equal(h.directories.size, 2);
    h.vscode.window.showQuickPick = async values => values[1];
    h.inputs.push('new.md'); await operation(h, 'newFile');
    assert.ok(h.texts.has('/other/new.md')); assert.equal(h.texts.has('/docs/new.md'), false);
    h.vscode.workspace.getWorkspaceFolder = file => h.vscode.workspace.workspaceFolders.find(folder => file.path === folder.uri.path || file.path.startsWith(folder.uri.path + '/'));
    await h.receive({ type: 'move', id: id('first.md'), targetId: 'file:///other' });
    assert.ok(h.texts.has('/other/first.md')); assert.equal(h.texts.has('/docs/first.md'), false);
  } finally { h.dispose(); }
});

test('Space-style preview preserves sidebar focus and opening to the side creates a pinned editor', async () => {
  const h = explorerHarness();
  try {
    await h.ready();
    await h.receive({ type: 'openPreview', id: id('first.md') });
    assert.equal(h.executed.at(-1)[3].preserveFocus, true); assert.equal(h.executed.at(-1)[3].preview, true);
    await h.receive({ type: 'openSide', id: id('first.md') });
    assert.equal(h.executed.at(-1)[3].viewColumn, -2); assert.equal(h.executed.at(-1)[3].preview, false);
    await operation(h, 'cut', id('first.md')); await h.commands.get('happyMarkdown.explorer.cancelCut')();
    assert.equal(h.current.cutId, undefined); assert.equal(h.texts.has('/docs/first.md'), true); assert.equal(h.edits.length, 0);
    await operation(h, 'copy', id('first.md')); await h.commands.get('happyMarkdown.explorer.cancelCut')();
    assert.equal(h.current.canPaste, true); // Escape cancels cuts, not copies.
  } finally { h.dispose(); }
});

test('assignable explorer commands operate only on a known selection and ignore stale IDs', async () => {
  const h = explorerHarness();
  try {
    await h.ready(); await h.receive({ type: 'selection', id: id('first.md') });
    await h.commands.get('happyMarkdown.explorer.duplicate')(); assert.ok(h.texts.has('/docs/first のコピー.md'));
    await h.receive({ type: 'selection', id: 'file:///outside/forged.md' });
    await h.commands.get('happyMarkdown.explorer.copyPath')(); assert.equal(h.clipboard, '/docs/first.md');
    await h.mode('search'); const count = h.edits.length;
    await h.commands.get('happyMarkdown.explorer.delete')(); assert.equal(h.edits.length, count);
    await h.mode('files'); await h.receive({ type: 'selection', id: id('first.md') });
    h.setVisible(false); await h.commands.get('happyMarkdown.explorer.duplicate')(); assert.equal(h.edits.length, count);
    const pkg = require('../package.json');
    for (const [command] of h.commands) if (command.startsWith('happyMarkdown.explorer.')) assert.ok(pkg.contributes.commands.some(item => item.command === command));
    assert.ok(pkg.contributes.keybindings.length > 10);
  } finally { h.dispose(); }
});
