# 構成と描画経路

編集・プレビュー・文書同期を分離し、将来別の編集UIを追加しやすい構成にしています。

## ファイルの責務

| 場所 | 責務 |
| --- | --- |
| `src/extension.ts` | VS Code文書操作、保存、Undo / Redo、Webview通信 |
| `src/shell.ts` | HTMLの枠組み、ツールバー、CSP |
| `src/markdown.ts` | Markdown描画、HTMLサニタイズ、タスク編集 |
| `src/text-change.ts` / `src/images.ts` | 差分編集、画像選択・コピー |
| `src/explorer.ts` | ファイル一覧・ブックマークのTreeView、表示モードと文書追従、検索の更新制御 |
| `src/workspace-search.ts` | 画面から独立した検索条件・本文検索処理 |
| `src/explorer-search.ts` | 検索用WebviewViewの登録、CSP、メッセージ検証 |
| `webview/explorer-search.ts` | 検索欄、IME・入力イベント、検索結果の安全なDOM描画 |
| `webview/editor.ts` | CodeMirrorと構文挿入 |
| `webview/session.ts` | 入力同期、応答待ち、競合処理 |
| `webview/workbench.ts` | 編集・プレビューの切り替えと接続 |
| `webview/preview.ts` / `webview/preview-search.ts` | プレビュー操作・検索 |
| `shared/messages.ts` | ホストとWebviewが共有する通信型と実行時の検証 |
| `src/types.ts` | エクスプローラーと検索のデータ型 |
| `webview/dom.ts` / `webview/vscode.d.ts` | 固定HTML要素とVS Code Webview APIの型 |
| `styles/` | 表示スタイル |
| `test/` | ビルド済みJavaScriptを検証するNode.jsの既存CommonJSテスト |
| `scripts/build.cjs` | Webview・テスト用モジュールのバンドルとライセンス出力。Node.jsから直接実行するCommonJS |

| その他の場所 | 役割 |
| --- | --- |
| `package.json` | 拡張メタデータ、コマンド、Custom Editor、ビューの登録、npmスクリプト |
| `.vscode/` | 拡張開発ホストの起動設定とビルドタスク |
| `wiki/` | 用途別の開発資料と、デバッグ起動時の検証用ワークスペース |
| `examples/` | Markdown表現をまとめた補助サンプル |
| `media/` | サイドバーのアイコンなど |
| `dist/` | ビルドで生成する拡張ホスト、共有コード、Webviewバンドルとライセンス情報 |
| `tsconfig.base.json` / `tsconfig.json` / `webview/tsconfig.json` | 共通の厳格な型検査設定、拡張ホスト用、Webview用の設定 |
| `.vscodeignore` | VSIXへの同梱対象から除外するファイル |

パスはリポジトリルートを基準とします。

アプリ本体はTypeScriptで記述しています。拡張ホストは `tsc` でCommonJSの `dist/src/` と `dist/shared/` に出力し、拡張のエントリーポイントは `dist/src/extension.js` です。Webviewはesbuildでブラウザー向けにバンドルします。ホストの型検査ではNode.js・VS Code API、Webviewの型検査ではDOM APIを使用し、`shared/` は環境固有のAPIに依存しません。UIは引き続きDOM操作とCodeMirrorで実装しており、Reactは未導入です。

## 2つの描画経路

専用画面はVS CodeのCustom Editorとして登録され、Webview内でCodeMirrorによる編集とプレビューを切り替えます。標準Markdownプレビューには `markdown.previewStyles` から共通CSSのみを適用します。専用画面の機能は標準プレビューにそのまま追加されるものではありません。

プレビューの描画にはmarkdown-it、構文色分けにはhighlight.js、HTMLのサニタイズにはsanitize-htmlを使用します。

## 関連資料

[Wikiホーム](../README.md) / [文書同期](document-sync.md) / [安全性](security.md)

## サイドバーの検索

ファイル一覧・ブックマークはTreeView、検索画面はWebviewViewを使い、コンテキストキーで同じサイドバー領域を切り替えます。本文検索は `{ text }` の条件オブジェクトを受け取る処理として分離し、将来のフロントマター条件の追加先を明確にしています。

検索入力は短い待ち時間でまとめ、世代番号で古い非同期処理を無効にします。Webview側でも入力IDと検索語を照合します。結果のファイル操作は拡張ホストが保持する結果一覧内のURIに限定し、本文・ファイル名をHTMLとして挿入しません。検索用スクリプトは `dist/explorer-search.js` にビルドし、CSSとともに拡張へ同梱します。

参考: [VS Code公式 — Webview API](https://code.visualstudio.com/api/extension-guides/webview)
