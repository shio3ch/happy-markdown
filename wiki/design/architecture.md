# 構成と描画経路

編集・プレビュー・文書同期を分離し、将来別の編集UIを追加しやすい構成にしています。

## ファイルの責務

| 場所 | 責務 |
| --- | --- |
| `src/extension.js` | VS Code文書操作、保存、Undo / Redo、Webview通信 |
| `src/shell.js` | HTMLの枠組み、ツールバー、CSP |
| `src/markdown.js` | Markdown描画、HTMLサニタイズ、タスク編集 |
| `src/text-change.js` / `src/images.js` | 差分編集、画像選択・コピー |
| `src/explorer.js` | ファイル一覧・ブックマークのTreeView、表示モードと文書追従、検索の更新制御 |
| `src/workspace-search.js` | 画面から独立した検索条件・本文検索処理 |
| `src/explorer-search.js` | 検索用WebviewViewの登録、CSP、メッセージ検証 |
| `webview/explorer-search.js` | 検索欄、IME・入力イベント、検索結果の安全なDOM描画 |
| `webview/editor.js` | CodeMirrorと構文挿入 |
| `webview/session.js` | 入力同期、応答待ち、競合処理 |
| `webview/workbench.js` | 編集・プレビューの切り替えと接続 |
| `webview/preview.js` / `webview/preview-search.js` | プレビュー操作・検索 |
| `styles/` | 表示スタイル |
| `test/` | Node.jsのテスト |
| `scripts/build.cjs` | Webviewのバンドルとライセンス出力 |

| その他の場所 | 役割 |
| --- | --- |
| `package.json` | 拡張メタデータ、コマンド、Custom Editor、ビューの登録、npmスクリプト |
| `.vscode/` | 拡張開発ホストの起動設定とビルドタスク |
| `wiki/` | 用途別の開発資料と、デバッグ起動時の検証用ワークスペース |
| `examples/` | Markdown表現をまとめた補助サンプル |
| `media/` | サイドバーのアイコンなど |
| `dist/` | ビルドで生成するWebviewバンドルとライセンス情報 |
| `.vscodeignore` | VSIXへの同梱対象から除外するファイル |

パスはリポジトリルートを基準とします。

## 2つの描画経路

専用画面はVS CodeのCustom Editorとして登録され、Webview内でCodeMirrorによる編集とプレビューを切り替えます。標準Markdownプレビューには `markdown.previewStyles` から共通CSSのみを適用します。専用画面の機能は標準プレビューにそのまま追加されるものではありません。

プレビューの描画にはmarkdown-it、構文色分けにはhighlight.js、HTMLのサニタイズにはsanitize-htmlを使用します。

## 関連資料

[Wikiホーム](../README.md) / [文書同期](document-sync.md) / [安全性](security.md)

## サイドバーの検索

ファイル一覧・ブックマークはTreeView、検索画面はWebviewViewを使い、コンテキストキーで同じサイドバー領域を切り替えます。本文検索は `{ text }` の条件オブジェクトを受け取る処理として分離し、将来のフロントマター条件の追加先を明確にしています。

検索入力は短い待ち時間でまとめ、世代番号で古い非同期処理を無効にします。Webview側でも入力IDと検索語を照合します。結果のファイル操作は拡張ホストが保持する結果一覧内のURIに限定し、本文・ファイル名をHTMLとして挿入しません。検索用スクリプトは `dist/explorer-search.js` にビルドし、CSSとともに拡張へ同梱します。

参考: [VS Code公式 — Webview API](https://code.visualstudio.com/api/extension-guides/webview)
