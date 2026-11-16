import type * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { defaultAppearance, readAppearance, readAppearanceProfile, maxAppearanceBytes, normalizeAppearance } from '../shared/appearance';
import type { Appearance, AppearanceProfile, AppearanceRequest, AppearanceResult } from '../shared/appearance';

const key = 'happyMarkdown.appearance.v2';
export class AppearanceService {
  private listeners = new Set<() => Promise<void>>();
  // 別の文書からの保存も順序通りに処理する。
  private saving: Promise<unknown> = Promise.resolve();
  constructor(private readonly context: vscode.ExtensionContext, private readonly api: typeof vscode) {}
  subscribe(listener: () => Promise<void>) { this.listeners.add(listener); return { dispose: () => { this.listeners.delete(listener); } }; }
  private current(): AppearanceProfile {
    const saved = readAppearanceProfile(this.context.globalState.get<unknown>(key));
    if (saved) return { ...saved, theme: normalizeAppearance(saved.theme) };
    const legacy = readAppearance(this.context.globalState.get<unknown>('happyMarkdown.appearance.v1'));
    const theme = normalizeAppearance(legacy || defaultAppearance);
    return { theme, custom: theme.name === 'カスタム' ? theme : undefined };
  }
  private async resources(profile: AppearanceProfile, webview: vscode.Webview) {
    return { ...profile, backgroundUri: await this.resource(profile.theme, webview),
      customBackgroundUri: profile.custom ? await this.resource(profile.custom, webview) : undefined };
  }
  private async resource(theme: Appearance, webview: vscode.Webview): Promise<string> {
    const image = theme.backgroundImage;
    if (!image.startsWith('data:')) return image;
    const data = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64');
    const format = image.startsWith('data:image/png;') ? 'png' : image.startsWith('data:image/jpeg;') ? 'jpeg' : 'webp';
    const valid = format === 'png' ? data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) :
      format === 'jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 :
        data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw new Error('画像形式を確認してください。');
    await this.api.workspace.fs.createDirectory(this.context.globalStorageUri);
    const uri = this.api.Uri.joinPath(this.context.globalStorageUri, `background-${createHash('sha256').update(data).digest('hex')}.${format}`);
    try { await this.api.workspace.fs.stat(uri); } catch { await this.api.workspace.fs.writeFile(uri, data); }
    return webview.asWebviewUri(uri).toString();
  }
  async handle(request: AppearanceRequest, webview: vscode.Webview) {
    const reply = (result: Omit<AppearanceResult, 'type' | 'action'>) => webview.postMessage({ type: 'appearanceResult', action: request.action, ...result } satisfies AppearanceResult);
    try {
      if (request.action === 'load') {
        await reply(await this.resources(this.current(), webview));
      } else if (request.action === 'save') {
        const theme = normalizeAppearance(request.theme);
        const profile = { theme, custom: theme.name === 'カスタム' ? theme : request.custom === null ? undefined : request.custom || this.current().custom };
        const result = await this.resources(profile, webview);
        this.saving = this.saving.catch(() => {}).then(() => this.context.globalState.update(key, profile));
        await this.saving;
        await reply({ ...result, message: '外観を適用しました。' });
        await Promise.allSettled([...this.listeners].map(listener => listener()));
      } else if (request.action === 'export') {
        const uri = await this.api.window.showSaveDialog({ filters: { 'Happy Markdownテーマ': ['json'] }, saveLabel: 'エクスポート' });
        if (!uri) { await reply({}); return; }
        // テーマの保存操作でMarkdown本文を上書きさせない。
        if (!/\.json$/i.test(uri.path)) throw new Error('JSONファイルを選んでください。');
        await this.api.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(normalizeAppearance(request.theme), null, 2) + '\n'));
        await reply({ message: 'テーマをエクスポートしました。' });
      } else if (request.action === 'import') {
        const files = await this.api.window.showOpenDialog({ canSelectMany: false, filters: { 'Happy Markdownテーマ': ['json'] }, openLabel: 'インポート' });
        if (!files?.[0]) { await reply({}); return; }
        if ((await this.api.workspace.fs.stat(files[0])).size > maxAppearanceBytes + 8192) throw new Error('テーマは3MB以内にしてください。');
        const bytes = await this.api.workspace.fs.readFile(files[0]);
        if (bytes.byteLength > maxAppearanceBytes + 8192) throw new Error('テーマは3MB以内にしてください。');
        const theme = readAppearance(JSON.parse(Buffer.from(bytes).toString('utf8')));
        if (!theme) throw new Error('テーマの形式・設定範囲が正しくありません（schemaVersion: 1）。');
        await reply({ theme: normalizeAppearance(theme), backgroundUri: await this.resource(theme, webview), message: 'インポートしました。「適用」で保存できます。' });
      } else {
        const files = await this.api.window.showOpenDialog({ canSelectMany: false, filters: { '背景画像': ['png', 'jpg', 'jpeg', 'webp'] }, openLabel: '背景画像を選ぶ' });
        if (!files?.[0]) { await reply({}); return; }
        if ((await this.api.workspace.fs.stat(files[0])).size > 2 * 1024 * 1024) throw new Error('背景画像は2MB以内にしてください。');
        const ext = /\.([^.]+)$/.exec(files[0].path)?.[1].toLowerCase();
        const mime = ext === 'png' ? 'png' : ext === 'jpg' || ext === 'jpeg' ? 'jpeg' : ext === 'webp' ? 'webp' : undefined;
        if (!mime) throw new Error('PNG・JPEG・WebPを選んでください。');
        const bytes = await this.api.workspace.fs.readFile(files[0]);
        if (bytes.byteLength > 2 * 1024 * 1024) throw new Error('背景画像は2MB以内にしてください。');
        const theme = { ...this.current().theme, backgroundImage: `data:image/${mime};base64,${Buffer.from(bytes).toString('base64')}` };
        await reply({ theme, backgroundUri: await this.resource(theme, webview) });
      }
    } catch (error) {
      await reply({ message: error instanceof Error ? error.message : '外観の操作を完了できませんでした。' });
    }
  }
}
