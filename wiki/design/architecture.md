# 構成と描画経路

専用画面とサイドバーの各部品をReactコンポーネントに分け、文書同期・検索・VS Code APIの処理を表示から分離しています。

## ファイルの責務

| 場所 | 責務 |
| --- | --- |
| `src/extension.ts` | VS Code文書操作、保存、Undo / Redo、Webview通信 |
| `src/shell.ts` | 専用画面のReactマウント先、CSS・スクリプト参照、CSPを持つHTMLシェル |
| `src/markdown.ts` | Markdown描画、HTMLサニタイズ、タスク編集 |
| `src/text-change.ts` / `src/images.ts` | 差分編集、画像選択・コピー |
| `src/explorer.ts` | ファイルツリー構築、検索・ブックマーク・文書追従・開閉状態の制御 |
| `src/explorer-view.ts` | 統合サイドバーのWebviewView、CSP、ID照合、表示用データとローカルアイコンURIの生成 |
| `src/workspace-search.ts` | 画面から独立した検索条件・本文検索処理 |
| `src/types.ts` | ホスト内のエクスプローラーと検索のデータ型 |
| `shared/messages.ts` | ホストとWebviewが共有する通信型と実行時の検証 |
| `webview/workbench.tsx` / `webview/explorer.tsx` | React画面をマウント・アンマウントする起動用エントリー |
| `webview/components/workbench/` | 専用画面、ツールバー、書式操作、見出し・画像メニュー、目次、本文検索、競合通知、編集・プレビューの部品 |
| `webview/components/explorer/` | サイドバー、表示切り替え、ファイルツリー・行・操作メニュー、ブックマーク一覧、検索欄・結果・カード・抜粋の部品 |
| `webview/components/common/` | 共通のボタン、アイコン、ドロップダウン、状態メッセージ |
| `webview/hooks/` | 本文検索、ツールバーメニューの状態とDOM連携 |
| `webview/workbench-controller.ts` / `webview/explorer-controller.ts` | 文書操作・検索入力・ホスト応答とReactの接続 |
| `webview/session.ts` | 入力同期、応答待ち、競合処理 |
| `webview/editor.ts` / `webview/formatting.ts` | CodeMirrorと構文挿入 |
| `webview/outline.ts` / `webview/preview-search.ts` | 目次の階層構築と本文内の検索強調 |
| `webview/api.ts` / `webview/vscode.d.ts` | VS Code Webview APIと復元する画面状態の型 |
| `styles/` | 専用画面・標準プレビューの共通CSS、専用画面とサイドバーのCSS |
| `test/` | ホスト処理のNode.jsテスト、jsdomでReact・CodeMirrorを動かすUI回帰テスト |
| `scripts/clean.cjs` / `scripts/build.cjs` | 生成先の削除、Webview・テスト用モジュールのバンドル、ライセンス出力 |

| その他の場所 | 役割 |
| --- | --- |
| `package.json` | 拡張メタデータ、コマンド、Custom Editor、WebviewViewの登録、npmスクリプト |
| `.vscode/` | 拡張開発ホストの起動設定とビルドタスク |
| `wiki/` | 開発資料とデバッグ時の検証用ワークスペース |
| `examples/` | Markdown表現をまとめた補助サンプル |
| `media/` | サイドバーとファイル・フォルダーのアイコン |
| `dist/` | 生成する拡張ホスト・共有コード・Webviewバンドル・ライセンス |
| `tsconfig.base.json` / `tsconfig.json` / `webview/tsconfig.json` | 共通の厳格な型検査、拡張ホスト、WebviewのTS・TSXの設定 |
| `.vscodeignore` | VSIXへの同梱対象から除外するファイル |

パスはリポジトリルートを基準とします。

拡張ホストは `tsc` でCommonJSの `dist/src/` と `dist/shared/` に出力します。拡張のエントリーポイントは `dist/src/extension.js` です。WebviewはReact・React DOM・CodeMirrorごとesbuildでバンドルします。ホストの型検査はNode.js・VS Code API、Webviewの型検査はDOM APIを使用し、`shared/` は環境固有のAPIに依存しません。

## コンポーネントと状態の境界

起動用エントリーには画面部品を実装せず、`components/` の画面を読み込みます。各画面は独立した部品をpropsで組み合わせます。共通のボタンやメニューは `common/`、専用画面の部品は `workbench/`、サイドバーの部品は `explorer/` に置きます。

個々の部品の責務と変更先は[画面コンポーネント](components.md)にまとめています。

`WorkbenchController` は既存の `DocumentSession` を通じて入力、応答待ち、競合、保存・Undo / Redo前の反映待ちを管理し、`useSyncExternalStore` でReactへ状態を渡します。`ExplorerController` は検索入力・IME・応答IDを管理し、表示切り替え・開閉・ファイル操作を検証済みのメッセージでホストへ依頼します。Reactの再描画自体は文書編集を発生させません。

CodeMirrorは `EditorPane` のEffectで生成し、モード切り替えでは同じインスタンスを表示・非表示にします。アンマウント時にエディターとテーマ監視を破棄し、Webviewのメッセージ購読・キーボードイベントも解除します。

Markdown本文は拡張ホストでサニタイズしたHTMLのみを、`Preview` のEffectから独立したDOM領域に反映します。検索の強調もこの領域内に限定します。本文更新時にはdetailsの開閉、スクロール位置、タスクのフォーカスを引き継ぎます。ツールバー・件数・目次・検索結果はReactが管理し、ファイル名や抜粋をHTMLとして挿入しません。

参考: [React公式 — createRoot](https://react.dev/reference/react-dom/client/createRoot)、[useEffect](https://react.dev/reference/react/useEffect)、[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

## 2つの描画経路

専用画面はVS CodeのCustom Editorとして登録され、Reactの画面内でCodeMirrorによる編集とプレビューを切り替えます。標準Markdownプレビューには `markdown.previewStyles` から共通CSSのみを適用します。専用画面の機能は標準プレビューにそのまま追加されるものではありません。

プレビューの描画にはmarkdown-it、構文色分けにはhighlight.js、HTMLのサニタイズにはsanitize-htmlを使用します。

## 統合サイドバー

`happyMarkdown.explorer` は1つのWebviewViewです。従来のTreeViewと検索用WebviewViewを統合し、ファイル一覧・本文検索・ブックマークの切り替えもReactで描画します。アクティビティバーの入口と外部から呼べる既存コマンドは維持し、モード切り替え・更新・文書追従のアイコンはWebview内の `ExplorerNavigation` に置きます。

`FileTree` と `FileTreeItem` はツリーの階層・フォーカス・選択を管理し、`FileActions` と `FileContextMenu` がソース表示・ブックマーク操作を提供します。開閉状態はホストが保持し、更新やモード切り替えでも維持します。文書追従では必要な親を開いて該当行を表示しますが、フォーカスを奪ったり非表示ビューを自動で開いたりしません。

本文検索は `{ text }` の条件オブジェクトを受け取る処理として分離し、世代番号で古い非同期処理を無効にします。Webview側でも入力IDと検索語を照合します。ファイル・フォルダーの操作はホストが保持する表示用データ内のIDに限定します。サイドバーのスクリプトは `dist/explorer.js`、CSSは `styles/explorer.css` で、ローカルアイコンを含め拡張に同梱します。

参考: [VS Code公式 — Webview API](https://code.visualstudio.com/api/extension-guides/webview)、[W3C — Tree View Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)

## 関連資料

[Wikiホーム](../README.md) / [画面コンポーネント](components.md) / [文書同期](document-sync.md) / [安全性](security.md)
