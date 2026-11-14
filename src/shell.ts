import { randomBytes } from 'node:crypto';
import type { Webview } from 'vscode';
import type { ResourceUri } from './types';
export function shell(webview: Pick<Webview, 'cspSource'>, resource: ResourceUri) {
  const nonce = randomBytes(16).toString('hex');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} https:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="style-nonce" content="${nonce}">
  <link rel="stylesheet" href="${resource('styles/preview.css')}"><link rel="stylesheet" href="${resource('styles/workbench.css')}">
  </head><body class="design-preview workbench">
  <div id="root"></div>
  <script nonce="${nonce}" src="${resource('dist/workbench.js')}"></script></body></html>`;
}
