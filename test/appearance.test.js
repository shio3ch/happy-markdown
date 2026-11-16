'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppearanceService } = require('../dist/extension/appearance');
const { defaultAppearance, appearancePresets, isAppearance, isAppearanceResult } = require('../dist/shared/appearance');
const { isEditorMessage } = require('../dist/shared/messages');
const { shell } = require('../dist/extension/shell');
const { webview, waitFor } = require('./webview-helper');

function fixture(saved = defaultAppearance) {
  const files = new Map(), sent = [], writes = [], notifications = [];
  let pick, target, fail = false;
  const service = new AppearanceService({
    globalState: { get: () => saved, update: async (_key, theme) => { if (fail) throw Error('保存できません'); saved = theme; } },
    globalStorageUri: { path: '/storage' },
  }, {
    Uri: { joinPath: (base, name) => ({ path: base.path + '/' + name }) },
    window: { showOpenDialog: async () => pick ? [{ path: pick }] : undefined, showSaveDialog: async () => target ? { path: target } : undefined },
    workspace: { fs: {
      stat: async uri => { if (!files.has(uri.path)) throw Error('not found'); return { size: files.get(uri.path).length }; },
      readFile: async uri => files.get(uri.path), createDirectory: async () => {},
      writeFile: async (uri, data) => { files.set(uri.path, data); writes.push(uri.path); },
    } },
  });
  service.subscribe(async () => { notifications.push(saved); });
  const view = { postMessage: async value => { sent.push(value); }, asWebviewUri: uri => ({ toString: () => 'https://webview.test' + uri.path }) };
  return { service, files, sent, writes, notifications, view,
    handle: async request => { await service.handle({ type: 'appearance', ...request }, view); return sent.at(-1); },
    pick: value => { pick = value; }, target: value => { target = value; }, fail: () => { fail = true; }, saved: () => saved };
}

test('appearance protocol rejects CSS injection, unsupported schemas, invalid ranges and non-string enums', () => {
  for (const preset of appearancePresets) assert.equal(isAppearance(preset), true);
  for (const patch of [
    { schemaVersion: 2 }, { fontSize: 100 }, { lineHeight: NaN }, { guides: 'yes' }, { name: '' },
    { accent: 'red; color: transparent' }, { background: '#fff' }, { backgroundImage: 'javascript:alert(1)' },
    { backgroundImage: 'https://example.com/");}body{color:red}' }, { backgroundImage: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { fontFamily: ['sans'] }, { headingStyle: ['glow'] }, { colorScheme: ['auto'] }, { css: 'body{}' },
  ]) {
    const theme = { ...defaultAppearance, ...patch };
    assert.equal(isAppearance(theme), false, JSON.stringify(patch));
    assert.equal(isEditorMessage({ type: 'appearance', action: 'save', theme }), false);
  }
  assert.equal(isAppearanceResult({ type: 'appearanceResult', action: 'load', theme: defaultAppearance, backgroundUri: '' }), true);
  assert.equal(isAppearanceResult({ type: 'appearanceResult', action: 'import', backgroundUri: 'data:image/png;base64,AAAA' }), false);
});

test('themes persist across service instances, notify open views and retain settings on storage failure', async () => {
  const c = fixture();
  const theme = { ...appearancePresets[2], fontSize: 21 };
  assert.deepEqual((await c.handle({ action: 'load' })).theme, defaultAppearance);
  assert.deepEqual((await c.handle({ action: 'save', theme })).theme, theme);
  assert.deepEqual(c.notifications, [theme]);
  assert.deepEqual((await fixture(c.saved()).handle({ action: 'load' })).theme, theme);
  c.fail();
  assert.equal((await c.handle({ action: 'save', theme: defaultAppearance })).theme, undefined);
  assert.deepEqual(c.saved(), theme);
});

test('JSON round trips include local raster images, use webview resources and never modify the source image', async () => {
  const c = fixture();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64');
  c.files.set('/original.png', png); c.pick('/original.png');
  const image = await c.handle({ action: 'background' });
  assert.match(image.backgroundUri, /^https:\/\/webview.test\/storage\/background-[a-f0-9]+\.png$/);
  assert.equal(image.theme.backgroundImage, 'data:image/png;base64,' + png.toString('base64'));
  const theme = { ...appearancePresets[1], backgroundImage: image.theme.backgroundImage };
  c.target('/theme.json'); await c.handle({ action: 'export', theme });
  c.pick('/theme.json');
  assert.deepEqual((await c.handle({ action: 'import' })).theme, theme);
  assert.deepEqual(c.saved(), defaultAppearance, 'import previews without saving');
  assert.deepEqual(c.files.get('/original.png'), png);
  assert.equal(c.writes.includes('/original.png'), false);
  assert.deepEqual(c.notifications, []);
});

test('invalid and cancelled imports preserve settings and exports reject Markdown destinations', async () => {
  const c = fixture();
  assert.equal((await c.handle({ action: 'import' })).theme, undefined);
  assert.equal((await c.handle({ action: 'background' })).theme, undefined);
  for (const value of ['{', JSON.stringify({ ...defaultAppearance, fontSize: 999 }), JSON.stringify({ ...defaultAppearance, backgroundImage: 'data:image/png;base64,AAAA' })]) {
    c.files.set('/invalid.json', Buffer.from(value)); c.pick('/invalid.json');
    const result = await c.handle({ action: 'import' });
    assert.equal(result.theme, undefined); assert.ok(result.message);
  }
  c.target('/notes.md');
  assert.ok((await c.handle({ action: 'export', theme: defaultAppearance })).message);
  assert.equal(c.writes.length, 0);
  assert.deepEqual(c.saved(), defaultAppearance);
});

test('appearance dialog previews, cancels, applies and imports themes without editing Markdown', async () => {
  const c = await webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path));
  const reply = (action, theme, extra = {}) => c.receive({ type: 'appearanceResult', action, theme, backgroundUri: '', ...extra });
  const button = text => [...c.document.querySelectorAll('#appearance-settings button')].find(element => element.textContent === text);
  try {
    await c.receive({ type: 'snapshot', text: '# 本文', html: '<h1>本文</h1>', version: 1, dirty: false });
    await reply('load', defaultAppearance);
    const editor = c.document.querySelector('.cm-editor');
    c.document.getElementById('appearance').click();
    await waitFor(() => c.document.getElementById('appearance-settings').open);
    button('ゲーミング').click();
    await waitFor(() => c.document.body.dataset.headingStyle === 'glow');
    button('キャンセル').click();
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    assert.equal(c.document.body.dataset.readingScheme, 'auto');
    assert.equal(c.sent.filter(item => item.action === 'save').length, 0);
    c.document.getElementById('appearance').click();
    await waitFor(() => c.document.getElementById('appearance-settings').open);
    button('ペーパー').click();
    await waitFor(() => c.document.body.dataset.readingScheme === 'light');
    button('適用').click();
    await waitFor(() => c.sent.some(item => item.action === 'save'));
    const save = c.sent.find(item => item.action === 'save');
    assert.equal(save.theme.name, 'ペーパー');
    assert.equal(button('適用').disabled, true);
    await reply('save', undefined, { message: '保存に失敗しました' });
    assert.equal(c.document.getElementById('appearance-settings').open, true);
    assert.equal(button('適用').disabled, false);
    button('適用').click(); await reply('save', save.theme);
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    assert.equal(c.document.body.dataset.readingScheme, 'light');
    c.document.getElementById('appearance').click();
    await waitFor(() => c.document.getElementById('appearance-settings').open);
    button('JSONを読み込む').click();
    await reply('import', { ...appearancePresets[2], fontSize: 23 });
    assert.equal(c.document.body.dataset.readingScheme, 'dark');
    c.document.getElementById('appearance-settings').dispatchEvent(new c.window.Event('cancel', { cancelable: true }));
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    assert.equal(c.document.body.dataset.readingScheme, 'light');
    assert.equal(c.document.querySelector('.cm-editor'), editor);
    assert.equal(c.sent.filter(item => item.type === 'edit').length, 0);
    assert.equal(c.document.querySelector('#document h1').textContent, '本文');
  } finally { await c.dispose(); }
});
