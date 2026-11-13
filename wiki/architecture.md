# 構成と設計

編集・プレビュー・文書同期を分離し、将来別の編集UIを追加しやすい構成にしています。

## ファイルの責務

| 場所 | 責務 |
| --- | --- |
| `src/extension.js` | VS Code文書操作、保存、Undo / Redo、Webview通信 |
| `src/shell.js` | HTMLの枠組み、ツールバー、CSP |
| `src/markdown.js` | Markdown描画、HTMLサニタイズ、タスク編集 |
| `src/text-change.js` / `src/images.js` | 差分編集、画像選択・コピー |
| `src/explorer.js` | Markdownファイル一覧 |
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
| `examples/` | 手動確認用のMarkdown文書など |
| `media/` | サイドバーのアイコンなど |
| `dist/` | ビルドで生成するWebviewバンドルとライセンス情報 |
| `.vscodeignore` | VSIXへの同梱対象から除外するファイル |

パスはリポジトリルートを基準とします。

## 2つの描画経路

専用画面はVS CodeのCustom Editorとして登録され、Webview内でCodeMirrorによる編集とプレビューを切り替えます。標準Markdownプレビューには `markdown.previewStyles` から共通CSSのみを適用します。専用画面の機能は標準プレビューにそのまま追加されるものではありません。

プレビューの描画にはmarkdown-it、構文色分けにはhighlight.js、HTMLのサニタイズにはsanitize-htmlを使用します。

## 文書同期

VS Codeの `TextDocument` を文書の基準とし、Webviewの入力は拡張ホスト側の `WorkspaceEdit` を通じて反映します。メッセージには文書バージョンと応答IDを付け、連続入力を順番に処理します。

`webview/session.js` は応答待ちの入力と文書の状態を管理します。古い応答で新しい入力を上書きせず、外部更新との競合や書き込み失敗では入力内容を保持します。競合解決では最新の文書を採用するか、入力中の内容で置換するかをユーザーが選択します。

保存・自動保存・Undo / RedoはVS Codeの文書管理と連携します。モード切り替えでは未保存の編集とカーソル位置を維持します。

## リソースと安全性

HTMLサニタイズとWebviewのCSPで、Markdown由来のスクリプトやイベント属性を実行させない設計です。ローカルリソースは `asWebviewUri` を通して参照します。

編集エンジンは拡張に同梱し、実行時にCDNからライブラリを取得したり文書を外部サービスへ送信したりしません。Markdown内で参照されたHTTPS画像は、その配信元から読み込みます。

ブラウザー向けコードは `dist/workbench.js` にバンドルされ、同梱ライブラリのライセンスは `dist/THIRD_PARTY_LICENSES.txt` に出力されます。
