'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AppearanceService } = require('../dist/extension/appearance');
const { backgroundPositions, defaultAppearance, appearancePresets, isAppearance, isAppearanceResult, normalizeAppearance } = require('../dist/shared/appearance');
const { isEditorMessage } = require('../dist/shared/messages');
const { shell } = require('../dist/extension/shell');
const { webview, waitFor } = require('./webview-helper');

function fixture(saved = defaultAppearance) {
  const files = new Map(), sent = [], writes = [], notifications = [];
  const storage = new Map([[saved?.schemaVersion === 1 ? 'happyMarkdown.appearance.v1' : 'happyMarkdown.appearance.v2', saved]]);
  let pick, target, fail = false;
  const service = new AppearanceService({
    globalState: { get: key => storage.get(key), update: async (key, value) => { if (fail) throw Error('保存できません'); storage.set(key, value); } },
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
  service.subscribe(async () => { notifications.push(storage.get('happyMarkdown.appearance.v2').theme); });
  const view = { postMessage: async value => { sent.push(value); }, asWebviewUri: uri => ({ toString: () => 'https://webview.test' + uri.path }) };
  return { service, files, sent, writes, notifications, view,
    handle: async request => { await service.handle({ type: 'appearance', ...request }, view); return sent.at(-1); },
    pick: value => { pick = value; }, target: value => { target = value; }, fail: () => { fail = true; },
    saved: () => storage.get('happyMarkdown.appearance.v2')?.theme || saved,
    profile: () => storage.get('happyMarkdown.appearance.v2') };
}

test('appearance protocol rejects CSS injection, unsupported schemas, invalid ranges and non-string enums', () => {
  for (const preset of appearancePresets) assert.equal(isAppearance(preset), true);
  for (const patch of [
    { schemaVersion: 2 }, { fontSize: 100 }, { lineHeight: NaN }, { guides: 'yes' }, { name: '' },
    { accent: 'red; color: transparent' }, { background: '#fff' }, { backgroundImage: 'javascript:alert(1)' },
    { backgroundImage: 'https://example.com/");}body{color:red}' }, { backgroundImage: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { fontFamily: ['sans'] }, { headingStyle: ['glow'] }, { colorScheme: ['auto'] }, { css: 'body{}' },
    { backgroundPosition: 'right; color: transparent' }, { backgroundPosition: ['center center'] }, { backgroundPosition: 'outside' },
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
  const theme = { ...appearancePresets[2], name: 'カスタム', fontSize: 21 };
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
  const theme = { ...appearancePresets[1], backgroundImage: image.theme.backgroundImage, backgroundPosition: 'right bottom' };
  c.target('/theme.json'); await c.handle({ action: 'export', theme });
  c.pick('/theme.json');
  assert.deepEqual((await c.handle({ action: 'import' })).theme, normalizeAppearance(theme));
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
  const choose = async name => {
    const select = c.document.getElementById('appearance-preset'); select.value = name;
    select.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await waitFor(() => c.document.getElementById('appearance-preset').value === name);
    await new Promise(resolve => setTimeout(resolve, 5));
  };
  try {
    await c.receive({ type: 'snapshot', text: '# 本文', html: '<h1>本文</h1>', version: 1, dirty: false });
    await reply('load', defaultAppearance);
    const editor = c.document.querySelector('.cm-editor');
    c.document.getElementById('appearance').click();
    await waitFor(() => c.document.getElementById('appearance-settings').open);
    assert.equal(c.document.querySelector('input[maxlength]'), null, 'テーマ名の変更欄はない');
    assert.deepEqual([...c.document.querySelectorAll('#appearance-preset option')].map(option => option.textContent), ['デフォルト', 'ペーパー', 'ゲーミング', 'カスタム']);
    await choose('ゲーミング');
    await waitFor(() => c.document.body.dataset.headingStyle === 'glow');
    button('キャンセル').click();
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    assert.equal(c.document.body.dataset.readingScheme, 'auto');
    assert.equal(c.sent.filter(item => item.action === 'save').length, 0);
    c.document.getElementById('appearance').click();
    await waitFor(() => c.document.getElementById('appearance-settings').open);
    await choose('ペーパー');
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
    button('インポート').click();
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

test('custom settings and their background survive applying a preset, reloading and restoring custom', async () => {
  const custom = { ...appearancePresets[2], name: 'カスタム', fontSize: 22, backgroundImage: 'https://example.com/background.png', backgroundPosition: 'left top' };
  const c = fixture();
  await c.handle({ action: 'save', theme: custom });
  await c.handle({ action: 'save', theme: appearancePresets[1] });
  const reloaded = fixture(c.profile());
  const result = await reloaded.handle({ action: 'load' });
  assert.deepEqual(result.theme, appearancePresets[1]);
  assert.deepEqual(result.custom, custom);
  assert.equal(result.customBackgroundUri, custom.backgroundImage);
  await reloaded.handle({ action: 'save', theme: result.custom });
  assert.deepEqual((await reloaded.handle({ action: 'load' })).theme, custom);
});

test('background positions round trip and older profiles and JSON keep their original central alignment', async () => {
  for (const { value } of backgroundPositions) {
    const c = fixture();
    const theme = { ...defaultAppearance, name: 'カスタム', backgroundPosition: value };
    await c.handle({ action: 'save', theme });
    assert.equal((await fixture(c.profile()).handle({ action: 'load' })).theme.backgroundPosition, value);
  }
  const { backgroundPosition, ...oldTheme } = { ...defaultAppearance, name: 'カスタム', backgroundImage: 'https://example.com/image.png', fontSize: 20 };
  const expected = { ...oldTheme, backgroundPosition: 'center center' };
  assert.deepEqual((await fixture(oldTheme).handle({ action: 'load' })).theme, expected);
  const c = fixture({ theme: appearancePresets[1], custom: oldTheme });
  assert.deepEqual((await c.handle({ action: 'load' })).custom, expected);
  c.files.set('/old.json', Buffer.from(JSON.stringify(oldTheme))); c.pick('/old.json');
  assert.deepEqual((await c.handle({ action: 'import' })).theme, expected);
});

test('background alignment previews, cancels and persists as custom with export support', async () => {
  const c = await webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path));
  const host = fixture();
  const open = async () => { c.document.getElementById('appearance').click(); await waitFor(() => c.document.getElementById('appearance-settings').open); };
  const button = text => [...c.document.querySelectorAll('#appearance-settings button')].find(element => element.textContent === text);
  const choose = async value => {
    const select = c.document.getElementById('appearance-background-position'); select.value = value;
    select.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 5));
  };
  try {
    await c.receive({ type: 'snapshot', text: '本文', html: '<p>本文</p>', version: 1, dirty: false });
    await c.receive(await host.handle({ action: 'load' })); await open();
    assert.equal(c.document.getElementById('appearance-background-position').options.length, 9);
    assert.equal(c.document.getElementById('appearance-background-position').value, 'center center');
    await choose('right bottom');
    assert.equal(c.document.getElementById('appearance-preset').value, 'カスタム');
    assert.ok([...c.document.querySelectorAll('style[nonce]')].some(style => style.textContent.includes('--reading-image-position:right bottom')));
    button('キャンセル').click();
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    await open(); assert.equal(c.document.getElementById('appearance-background-position').value, 'center center');
    await choose('left top'); button('適用').click();
    await waitFor(() => c.sent.some(message => message.action === 'save'));
    await c.receive(await host.handle(c.sent.find(message => message.action === 'save')));
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    await c.receive(await fixture(host.profile()).handle({ action: 'load' })); await open();
    assert.equal(c.document.getElementById('appearance-background-position').value, 'left top');
    button('エクスポート').click();
    await waitFor(() => c.sent.some(message => message.action === 'export'));
    const request = c.sent.find(message => message.action === 'export');
    host.target('/alignment.json'); await host.handle(request);
    assert.equal(JSON.parse(host.files.get('/alignment.json').toString('utf8')).backgroundPosition, 'left top');
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
  } finally { await c.dispose(); }
});

test('legacy names migrate without changing values and preset names never conceal customized settings', async () => {
  const oldDefault = { ...defaultAppearance, name: 'VS Codeに追従' };
  assert.deepEqual((await fixture(oldDefault).handle({ action: 'load' })).theme, defaultAppearance);
  const oldCustom = { ...oldDefault, fontSize: 19, name: '好きな名前' };
  const loaded = await fixture(oldCustom).handle({ action: 'load' });
  assert.deepEqual(loaded.theme, { ...oldCustom, name: 'カスタム' });
  assert.deepEqual(loaded.custom, loaded.theme);
  assert.equal(normalizeAppearance({ ...appearancePresets[1], lineHeight: 2 }).name, 'カスタム');
  assert.equal(isEditorMessage({ type: 'appearance', action: 'save', theme: defaultAppearance, custom: appearancePresets[1] }), false);
  assert.equal(isAppearanceResult({ type: 'appearanceResult', action: 'load', custom: { ...defaultAppearance, name: 'カスタム', fontSize: 999 } }), false);
});

test('editing any preset selects custom, keeps a separate draft and persists it alongside the chosen preset', async () => {
  const c = await webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path));
  const host = fixture();
  const receive = async request => c.receive(await host.handle(request));
  const open = async () => { c.document.getElementById('appearance').click(); await waitFor(() => c.document.getElementById('appearance-settings').open); };
  const button = text => [...c.document.querySelectorAll('#appearance-settings button')].find(element => element.textContent === text);
  const choose = async name => {
    const select = c.document.getElementById('appearance-preset'); select.value = name;
    select.dispatchEvent(new c.window.Event('change', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 5));
  };
  try {
    await c.receive({ type: 'snapshot', text: '本文', html: '<p>本文</p>', version: 1, dirty: false });
    await receive({ action: 'load' }); await open();
    assert.equal(c.document.querySelector('#appearance-preset option[value="カスタム"]').disabled, true);
    await c.input(c.document.querySelector('input[type="range"]'), '22');
    await waitFor(() => c.document.getElementById('appearance-preset').value === 'カスタム');
    await choose('ペーパー');
    assert.equal(c.document.querySelector('input[type="range"]').value, '15');
    await choose('カスタム');
    assert.equal(c.document.querySelector('input[type="range"]').value, '22');
    await choose('ゲーミング'); button('適用').click();
    await waitFor(() => c.sent.some(message => message.action === 'save'));
    const request = c.sent.find(message => message.action === 'save');
    assert.equal(request.theme.name, 'ゲーミング'); assert.equal(request.custom.fontSize, 22);
    await receive(request);
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    await receive({ action: 'load' }); await open(); await choose('カスタム');
    assert.equal(c.document.querySelector('input[type="range"]').value, '22');
    button('キャンセル').click();
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    await open(); assert.equal(c.document.getElementById('appearance-preset').value, 'ゲーミング');
    button('エクスポート').click();
    await waitFor(() => c.sent.some(message => message.action === 'export'));
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
  } finally { await c.dispose(); }
});

test('reset clears custom values and background only when applied, survives reload and allows new custom edits', async () => {
  const custom = { ...appearancePresets[2], name: 'カスタム', fontSize: 24, backgroundImage: 'https://example.com/background.png', backgroundPosition: 'right bottom' };
  const host = fixture(custom);
  const c = await webview('workbench', shell({ cspSource: 'https://webview.test' }, path => path));
  const open = async () => { c.document.getElementById('appearance').click(); await waitFor(() => c.document.getElementById('appearance-settings').open); };
  const button = text => [...c.document.querySelectorAll('#appearance-settings button')].find(element => element.textContent === text);
  const customOption = () => c.document.querySelector('#appearance-preset option[value="カスタム"]');
  const reset = async () => {
    button('初期値に戻す').click();
    await waitFor(() => c.document.getElementById('appearance-preset').value === 'デフォルト');
    assert.equal(customOption().disabled, true, 'リセット後は以前のカスタムを選べない');
    assert.equal(c.document.querySelector('input[type="range"]').value, '15');
    assert.equal(c.document.getElementById('appearance-background-position').value, 'center center');
  };
  try {
    await c.receive({ type: 'snapshot', text: '本文', html: '<p>本文</p>', version: 1, dirty: false });
    await c.receive(await host.handle({ action: 'load' })); await open();
    await reset();
    assert.equal(c.sent.some(message => message.action === 'save'), false);
    button('キャンセル').click();
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    await open(); assert.equal(c.document.getElementById('appearance-preset').value, 'カスタム');
    assert.equal(c.document.querySelector('input[type="range"]').value, '24');
    assert.equal(c.document.getElementById('appearance-background-position').value, 'right bottom');
    await reset(); button('適用').click();
    await waitFor(() => c.sent.some(message => message.action === 'save'));
    const request = c.sent.find(message => message.action === 'save');
    assert.equal(request.custom, null, '保持との区別がつく明示的な削除を送る');
    assert.equal(isEditorMessage(request), true);
    await c.receive(await host.handle(request));
    await waitFor(() => !c.document.getElementById('appearance-settings').open);
    const loaded = await host.handle({ action: 'load' });
    assert.deepEqual(loaded.theme, defaultAppearance);
    assert.equal(loaded.custom, undefined, '以前のv1カスタムを復活させない');
    const reloaded = await fixture(host.profile()).handle({ action: 'load' });
    assert.deepEqual(reloaded.theme, defaultAppearance); assert.equal(reloaded.custom, undefined);
    await c.receive(reloaded); await open(); assert.equal(customOption().disabled, true);
    await c.input(c.document.querySelector('input[type="range"]'), '18');
    await waitFor(() => c.document.getElementById('appearance-preset').value === 'カスタム');
    button('適用').click();
    await waitFor(() => c.sent.filter(message => message.action === 'save').length === 2);
    const next = c.sent.filter(message => message.action === 'save').at(-1);
    assert.equal(next.custom.fontSize, 18);
    assert.equal(next.custom.backgroundImage, '');
    assert.equal(next.custom.backgroundPosition, 'center center');
    assert.equal(c.sent.filter(message => message.type === 'edit').length, 0);
  } finally { await c.dispose(); }
});
