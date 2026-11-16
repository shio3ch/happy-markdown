# 構成と描画経路

専用画面とサイドバーの各部品をReactコンポーネントに分け、文書同期・検索・VS Code APIの処理を表示から分離しています。

## ソースの配置と実行環境

製品のTypeScript・TSXソースは `src/` にまとめ、実行環境と役割で分けています。WebviewはVS Code内にHTML・CSS・JavaScriptで画面を表示する仕組みで、専用画面とサイドバーの製品コードを含みます。

```text
src/
├── extension/   # 拡張ホスト：VS Code API、文書・ファイル操作
├── webview/     # Webview画面：React、CodeMirror、components
└── shared/      # ホストと画面が共有する通信型・検証
```

画面側の操作はメッセージで拡張ホストに依頼し、文書の変更や保存はホスト側で実行します。開発用の起動設定は `.vscode/`、テストは `test/`、ビルド用スクリプトは `scripts/`、CSSは `styles/` に置きます。

## ファイルの責務

| 場所 | 責務 |
| --- | --- |
| `src/extension/extension.ts` | VS Code文書操作、保存、Undo / Redo、Webview通信 |
| `src/extension/shell.ts` | 専用画面のReactマウント先、CSS・スクリプト参照、CSPを持つHTMLシェル |
| `src/extension/markdown.ts` | Markdown描画、HTMLサニタイズ、タスク編集 |
| `src/extension/text-change.ts` / `src/extension/images.ts` | 差分編集、画像選択・コピー |
| `src/extension/explorer.ts` | ファイルツリー構築、検索・ブックマーク・文書追従・開閉状態の制御 |
| `src/extension/explorer-files.ts` | 空フォルダーの取得、作成・複製・移動・削除・クリップボード、操作の直列化とパス検証 |
| `src/extension/explorer-keybindings.ts` | キーバインド用のフォーカス・選択・クリップボード・処理中のコンテキストをVS Codeに提供 |
| `src/extension/explorer-view.ts` | 統合サイドバーのWebviewView、CSP、ID照合、表示用データとローカルアイコンURIの生成 |
| `src/extension/workspace-search.ts` | 画面から独立した検索条件・本文検索処理 |
| `src/extension/types.ts` | ホスト内のエクスプローラーと検索のデータ型 |
| `src/shared/messages.ts` | ホストとWebviewが共有する通信型と実行時の検証 |
| `src/shared/appearance.ts` / `src/extension/appearance.ts` | 外観スキーマ・プリセット・入力検証、設定の永続化・JSON入出力・背景画像の解決 |
| `src/webview/workbench.tsx` / `src/webview/explorer.tsx` | React画面をマウント・アンマウントする起動用エントリー |
| `src/webview/components/workbench/` | 専用画面、ツールバー、書式操作、見出し・画像メニュー、目次、本文検索、競合通知、編集・プレビューの部品 |
| `src/webview/components/explorer/` | サイドバー、表示切り替え、ファイルツリー・行・操作メニュー、ブックマーク一覧、検索欄・結果・カード・抜粋の部品 |
| `src/webview/components/common/` | 共通のボタン、アイコン、ドロップダウン、状態メッセージ |
| `src/webview/hooks/` | 本文検索、ツールバーメニューの状態とDOM連携 |
| `src/webview/workbench-controller.ts` / `src/webview/explorer-controller.ts` | 文書操作・検索入力・ホスト応答とReactの接続 |
| `src/webview/session.ts` | 入力同期、応答待ち、競合処理 |
| `src/webview/editor.ts` / `src/webview/formatting.ts` | CodeMirrorと構文挿入 |
| `src/webview/live-preview.ts` | 構文木・表示範囲・選択行に応じたライブ装飾、タスクのチェック操作、IME中の装飾更新の抑制 |
| `src/webview/mermaid-preview.ts` / `src/webview/mermaid-view.ts` | Mermaidフェンスのブロック装飾、非同期描画の直列化・キャンセル、SVGのサニタイズとテーマ追従 |
| `src/webview/table-preview.ts` | 表のブロック装飾、本文カーソルとセル編集の接続 |
| `src/webview/table-view.ts` | セルの直接入力、行・列・表の構造変更、キーボード・フォーカス・IME・ホスト操作の接続 |
| `src/webview/table-controls.ts` | 行・列のホバーと操作メニュー、右上の表オプション、ドラッグ・キーボード移動、位置計測 |
| `src/webview/table-cell.ts` / `src/webview/table-model.ts` | セルの安全な描画・Markdown変換、元文書上のセル範囲・差分の計算 |
| `src/webview/outline.ts` / `src/webview/preview-search.ts` | 目次の階層構築と本文内の検索強調 |
| `src/webview/api.ts` / `src/webview/vscode.d.ts` | VS Code Webview APIと復元する画面状態の型 |
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
| `tsconfig.base.json` / `tsconfig.json` / `src/webview/tsconfig.json` | 共通の厳格な型検査、拡張ホスト、WebviewのTS・TSXの設定 |
| `.vscodeignore` | VSIXへの同梱対象から除外するファイル |

パスはリポジトリルートを基準とします。

拡張ホストは `tsc` でCommonJSの `dist/extension/` と `dist/shared/` に出力します。拡張のエントリーポイントは `dist/extension/extension.js` です。WebviewはReact・React DOM・CodeMirrorごとesbuildでバンドルします。ホストの型検査はNode.js・VS Code API、Webviewの型検査はDOM APIを使用し、`src/shared/` は環境固有のAPIに依存しません。

## コンポーネントと状態の境界

起動用エントリーには画面部品を実装せず、`components/` の画面を読み込みます。各画面は独立した部品をpropsで組み合わせます。共通のボタンやメニューは `common/`、専用画面の部品は `workbench/`、サイドバーの部品は `explorer/` に置きます。

個々の部品の責務と変更先は[画面コンポーネント](components.md)にまとめています。

`WorkbenchController` は既存の `DocumentSession` を通じて入力、応答待ち、競合、保存・Undo / Redo前の反映待ちを管理し、`useSyncExternalStore` でReactへ状態を渡します。`ExplorerController` は検索入力・IME・応答IDを管理し、表示切り替え・開閉・ファイル操作を検証済みのメッセージでホストへ依頼します。Reactの再描画自体は文書編集を発生させません。

CodeMirrorは `EditorPane` のEffectで生成し、モード切り替えでは同じインスタンスを表示・非表示にします。アンマウント時にエディターとテーマ監視を破棄し、Webviewのメッセージ購読・キーボードイベントも解除します。

表は改行を含む範囲を置換するため、`table-preview.ts` のStateFieldから装飾を直接供給し、表のまま編集します。本文側の矢印移動では表を1つの範囲として扱い、セル入力は `TableView` が受け持ちます。`WidgetType.updateDOM` で入力中のDOMを維持し、セルの変更・行や列の追加・削除・並べ替え・表全体の削除は `table-model.ts` の差分をCodeMirrorの変更として同期します。保存・Undo / Redoはホストへ依頼し、別の文書履歴を持ちません。

行・列の操作部品は `table-controls.ts` に分離しています。ホバーした対象のハンドルだけを表示し、クリックで操作メニュー、ドラッグで並べ替えを行います。右上のオプションから表全体の削除を選びます。メニューの世代と表の内容更新を照合し、古いメニュー項目からの変更を防ぎます。横スクロールとサイズ変更に追従し、位置はCodeMirrorの[requestMeasure](https://codemirror.net/docs/ref/#view.EditorView.requestMeasure)で読取・書込フェーズを分けて計測します。ドラッグはポインターを捕捉して表内の境界を選び、完了時だけ文書を変更します。外部のドラッグデータを構造操作として解釈せず、IME中・表の内容更新・キャンセル・破棄時は移動を取り消します。

セル内の装飾は同梱したmarkdown-itで解釈し、許可した要素をDOM APIで構築します。入力DOMは `table-cell.ts` でMarkdownへ変換し、パイプなどの文字をエスケープします。HTML文字列を挿入せず、文書由来のHTML属性やURLを引き継ぎません。リンク・画像の元参照はDOM属性ではなくメモリ内で保持します。

Markdown本文は拡張ホストでサニタイズしたHTMLのみを、`Preview` のEffectから独立したDOM領域に反映します。検索の強調もこの領域内に限定します。本文更新時にはdetailsの開閉、スクロール位置、タスクのフォーカスを引き継ぎます。ツールバー・件数・目次・検索結果はReactが管理し、ファイル名や抜粋をHTMLとして挿入しません。

参考: [React公式 — createRoot](https://react.dev/reference/react-dom/client/createRoot)、[useEffect](https://react.dev/reference/react/useEffect)、[useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)

## 2つの描画経路

専用画面はVS CodeのCustom Editorとして登録され、Reactの画面内でCodeMirrorによる編集とプレビューを切り替えます。標準Markdownプレビューには `markdown.previewStyles` から共通CSSのみを適用します。専用画面の機能は標準プレビューにそのまま追加されるものではありません。

プレビューの描画にはmarkdown-it、構文色分けにはhighlight.js、HTMLのサニタイズにはsanitize-htmlを使用します。

見出し・文字装飾・引用などの基本書式は `styles/preview.css` でHTML要素とCodeMirrorの装飾クラスにまとめて適用します。`styles/workbench.css` には専用画面の配置・編集UIを置き、基本書式を別々に定義しません。CodeMirror側のMarkdown構文色分けで見出しの色や太さを上書きしないようにします。専用画面の本文幅・外側の余白は両モードで同じCSS変数を使います。

外観設定の画面は `AppearanceSettings`、試着と保存済みの外観の管理は `use-appearance.ts` に分けます。`styles/appearance.css` は設定UIと専用文書・サンプルのテーマ指定です。フックが検証済みの設定からnonce付きstyle要素を生成し、CSS変数を設定します。CodeMirrorの構文色分けとMermaidは外観の明るさにも追従します。保存はホスト側の `AppearanceService` が行い、同一ウィンドウの専用画面へ通知します。

## 統合サイドバー

`happyMarkdown.explorer` は1つのWebviewViewです。従来のTreeViewと検索用WebviewViewを統合し、ファイル一覧・本文検索・ブックマークの切り替えもReactで描画します。アクティビティバーの入口と外部から呼べる既存コマンドは維持し、モード切り替え・更新・文書追従のアイコンはWebview内の `ExplorerNavigation` に置きます。

`FileTree` と `FileTreeItem` はツリーの階層・フォーカス・選択を管理し、`FileActions` が行内のソース表示・ブックマーク操作を提供し、`FileContextMenu` がファイル操作を提供します。メニューはPortalでbody配下に置き、画面内に収まる位置と高さを計算します。`ExplorerFiles` は検証済みIDに対応するURIを使い、ファイル操作を直列化します。名前とワークスペース境界・シンボリックリンクを検証し、ファイルの変更はWorkspaceEdit、フォルダー作成はworkspace.fsを使います。開閉状態はホストが保持し、更新やモード切り替えでも維持します。文書追従では必要な親を開いて該当行を表示しますが、フォーカスを奪ったり非表示ビューを自動で開いたりしません。

ファイル操作のキーは `package.json` の `contributes.keybindings` に登録し、VS Codeで解決します。`src/extension/explorer-keybindings.ts` が `setContext` を使い、ツリーのフォーカス・選択種別・ルート・クリップボード・処理中の状態を提供します。ホストの `happyMarkdown.explorer.*` コマンドは選択IDを照合して処理し、Webviewはキーの組み合わせから操作を再実行しません。`useExplorerTreeFocus` は選択IDをフォーカス有効化より先に通知し、Webviewの再フォーカス時にも状態と操作行を復元します。`setContext` の更新はAPI応答の直列待ちを挟まずイベント順で発行します。コピー等のクリップボードだけを変える操作ではツリーを再取得しません。メニュー表示・フォルダー開閉のUIコマンドはホストからコントローラーへ通知します。独自メニューのキー表記は `src/webview/explorer-keybinding-labels.ts` の既定表示だけに限定します。名前変更・削除の完了後は `focusTree` 応答でツリーへフォーカスを戻し、通常の文書追従ではフォーカスを奪いません。

本文検索は `{ text }` の条件オブジェクトを受け取る処理として分離し、世代番号で古い非同期処理を無効にします。Webview側でも入力IDと検索語を照合します。ファイル・フォルダーの操作はホストが保持する表示用データ内のIDに限定します。サイドバーのスクリプトは `dist/explorer.js`、CSSは `styles/explorer.css` で、ローカルアイコンを含め拡張に同梱します。

参考: [VS Code公式 — Webview API](https://code.visualstudio.com/api/extension-guides/webview)、[W3C — Tree View Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)

## 関連資料

[Wikiホーム](../README.md) / [画面コンポーネント](components.md) / [文書同期](document-sync.md) / [安全性](security.md)
