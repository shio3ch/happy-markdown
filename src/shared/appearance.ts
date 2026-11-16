export const backgroundPositions = [
  { value: 'left top', label: '左上' }, { value: 'center top', label: '上' }, { value: 'right top', label: '右上' },
  { value: 'left center', label: '左' }, { value: 'center center', label: '中央' }, { value: 'right center', label: '右' },
  { value: 'left bottom', label: '左下' }, { value: 'center bottom', label: '下' }, { value: 'right bottom', label: '右下' },
] as const;
export type BackgroundPosition = typeof backgroundPositions[number]['value'];

export interface Appearance {
  schemaVersion: 1;
  name: string;
  fontSize: number;
  lineHeight: number;
  contentWidth: number;
  paragraphGap: number;
  listIndent: number;
  listSpacing: number;
  markerSize: number;
  guides: boolean;
  fontFamily: 'sans' | 'serif' | 'mono';
  headingStyle: 'plain' | 'line' | 'glow';
  colorScheme: 'auto' | 'light' | 'dark';
  foreground: string;
  background: string;
  accent: string;
  backgroundImage: string;
  backgroundPosition: BackgroundPosition;
  backgroundOpacity: number;
}

export const defaultAppearance: Appearance = {
  schemaVersion: 1, name: 'デフォルト', fontSize: 15, lineHeight: 1.75, contentWidth: 960,
  paragraphGap: 1.25, listIndent: 2.2, listSpacing: 0.3, markerSize: 1.15, guides: true,
  fontFamily: 'sans', headingStyle: 'line', colorScheme: 'auto', foreground: '', background: '', accent: '',
  backgroundImage: '', backgroundPosition: 'center center', backgroundOpacity: 0.12,
};
export const appearancePresets: Appearance[] = [
  defaultAppearance,
  { ...defaultAppearance, name: 'ペーパー', colorScheme: 'light', fontFamily: 'serif', foreground: '#38352e', background: '#f7f2e8', accent: '#94643d' },
  { ...defaultAppearance, name: 'ゲーミング', colorScheme: 'dark', foreground: '#e6e9ff', background: '#101322', accent: '#55f5cb', headingStyle: 'glow' },
];

// 旧バージョンのテーマ名も、設定値を維持してプリセット／カスタムへ引き継ぐ。
export function normalizeAppearance(theme: Appearance): Appearance {
  if (theme.name === 'カスタム') return { ...theme };
  const preset = appearancePresets.find(candidate => (Object.keys(candidate) as (keyof Appearance)[])
    .every(key => key === 'name' || candidate[key] === theme[key]));
  return { ...theme, name: preset?.name || 'カスタム' };
}
export interface AppearanceProfile { theme: Appearance; custom?: Appearance }
export function readAppearanceProfile(value: unknown): AppearanceProfile | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const profile = value as Record<string, unknown>;
  const theme = readAppearance(profile.theme), custom = profile.custom === undefined ? undefined : readAppearance(profile.custom);
  if (!theme || (profile.custom !== undefined && (!custom || custom.name !== 'カスタム'))) return undefined;
  return { theme, custom };
}
// 配置設定がない旧テーマ・保存済み設定は、以前と同じ中央配置で読み込む。
export function readAppearance(value: unknown): Appearance | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const theme = Object.hasOwn(value, 'backgroundPosition') ? value : { ...value, backgroundPosition: 'center center' };
  return isAppearance(theme) ? theme : undefined;
}

// インポートと通信の両方で同じ制限を使う。CSSやSVGをテーマとして実行しない。
export const maxAppearanceBytes = 3 * 1024 * 1024;
export function isBackgroundImage(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === '') return true;
  if (value.length > maxAppearanceBytes) return false;
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return true;
  try { return new URL(value).protocol === 'https:' && !/[\s"'\\(){}<>]/.test(value); } catch { return false; }
}
export function isAppearance(value: unknown): value is Appearance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const a = value as Record<string, unknown>;
  const number = (key: string, min: number, max: number) => typeof a[key] === 'number' && Number.isFinite(a[key]) && a[key] >= min && a[key] <= max;
  const color = (key: string) => typeof a[key] === 'string' && (a[key] === '' || /^#[\da-f]{6}$/i.test(a[key]));
  return Object.keys(a).length === Object.keys(defaultAppearance).length && Object.keys(a).every(key => Object.hasOwn(defaultAppearance, key)) &&
    a.schemaVersion === 1 && typeof a.name === 'string' && a.name.length > 0 && a.name.length <= 80 &&
    number('fontSize', 12, 32) && number('lineHeight', 1.3, 2.4) && number('contentWidth', 560, 1600) &&
    number('paragraphGap', 0.5, 2.5) && number('listIndent', 1.5, 3.5) && number('listSpacing', 0, 1) &&
    number('markerSize', 1, 1.6) && number('backgroundOpacity', 0, 0.4) &&
    backgroundPositions.some(position => position.value === a.backgroundPosition) && typeof a.guides === 'boolean' &&
    typeof a.fontFamily === 'string' && ['sans', 'serif', 'mono'].includes(a.fontFamily) &&
    typeof a.headingStyle === 'string' && ['plain', 'line', 'glow'].includes(a.headingStyle) &&
    typeof a.colorScheme === 'string' && ['auto', 'light', 'dark'].includes(a.colorScheme) && color('foreground') && color('background') && color('accent') && isBackgroundImage(a.backgroundImage);
}
export type AppearanceRequest =
  | { type: 'appearance'; action: 'load' | 'import' | 'background' }
  | { type: 'appearance'; action: 'save' | 'export'; theme: Appearance; custom?: Appearance | null };
export interface AppearanceResult {
  type: 'appearanceResult'; action: 'load' | 'save' | 'import' | 'export' | 'background';
  theme?: Appearance; backgroundUri?: string; message?: string;
  custom?: Appearance; customBackgroundUri?: string;
}
export function isAppearanceRequest(value: Record<string, unknown>): value is Record<string, unknown> & AppearanceRequest {
  return value.type === 'appearance' && typeof value.action === 'string' && (['load', 'import', 'background'].includes(value.action) ||
    (['save', 'export'].includes(value.action) && isAppearance(value.theme) &&
      (value.custom === undefined || value.custom === null || (isAppearance(value.custom) && value.custom.name === 'カスタム'))));
}
export function isAppearanceResult(value: unknown): value is AppearanceResult {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  const uri = (value: unknown) => value === undefined || value === '' || (typeof value === 'string' && /^https:\/\//.test(value) && !/[\s"'\\(){}<>]/.test(value));
  return a.type === 'appearanceResult' && typeof a.action === 'string' && ['load', 'save', 'import', 'export', 'background'].includes(a.action) &&
    (a.theme === undefined || isAppearance(a.theme)) && uri(a.backgroundUri) && uri(a.customBackgroundUri) &&
    (a.custom === undefined || (isAppearance(a.custom) && a.custom.name === 'カスタム')) &&
    (a.message === undefined || typeof a.message === 'string');
}
