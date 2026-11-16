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
  backgroundOpacity: number;
}

export const defaultAppearance: Appearance = {
  schemaVersion: 1, name: 'VS Codeに追従', fontSize: 15, lineHeight: 1.75, contentWidth: 960,
  paragraphGap: 1.25, listIndent: 2.2, listSpacing: 0.3, markerSize: 1.15, guides: true,
  fontFamily: 'sans', headingStyle: 'line', colorScheme: 'auto', foreground: '', background: '', accent: '',
  backgroundImage: '', backgroundOpacity: 0.12,
};
export const appearancePresets: Appearance[] = [
  defaultAppearance,
  { ...defaultAppearance, name: 'ペーパー', colorScheme: 'light', fontFamily: 'serif', foreground: '#38352e', background: '#f7f2e8', accent: '#94643d' },
  { ...defaultAppearance, name: 'ゲーミング', colorScheme: 'dark', foreground: '#e6e9ff', background: '#101322', accent: '#55f5cb', headingStyle: 'glow' },
];

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
    number('markerSize', 1, 1.6) && number('backgroundOpacity', 0, 0.4) && typeof a.guides === 'boolean' &&
    typeof a.fontFamily === 'string' && ['sans', 'serif', 'mono'].includes(a.fontFamily) &&
    typeof a.headingStyle === 'string' && ['plain', 'line', 'glow'].includes(a.headingStyle) &&
    typeof a.colorScheme === 'string' && ['auto', 'light', 'dark'].includes(a.colorScheme) && color('foreground') && color('background') && color('accent') && isBackgroundImage(a.backgroundImage);
}
export type AppearanceRequest =
  | { type: 'appearance'; action: 'load' | 'import' | 'background' }
  | { type: 'appearance'; action: 'save' | 'export'; theme: Appearance };
export interface AppearanceResult {
  type: 'appearanceResult'; action: 'load' | 'save' | 'import' | 'export' | 'background';
  theme?: Appearance; backgroundUri?: string; message?: string;
}
export function isAppearanceRequest(value: Record<string, unknown>): value is Record<string, unknown> & AppearanceRequest {
  return value.type === 'appearance' && typeof value.action === 'string' && (['load', 'import', 'background'].includes(value.action) ||
    (['save', 'export'].includes(value.action) && isAppearance(value.theme)));
}
export function isAppearanceResult(value: unknown): value is AppearanceResult {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Record<string, unknown>;
  return a.type === 'appearanceResult' && typeof a.action === 'string' && ['load', 'save', 'import', 'export', 'background'].includes(a.action) &&
    (a.theme === undefined || isAppearance(a.theme)) && (a.backgroundUri === undefined || a.backgroundUri === '' || (typeof a.backgroundUri === 'string' && /^https:\/\//.test(a.backgroundUri) && !/[\s"'\\(){}<>]/.test(a.backgroundUri))) &&
    (a.message === undefined || typeof a.message === 'string');
}
