# 画面コンポーネント

画面を変更するときの実装先をまとめます。専用画面とサイドバーはそれぞれReactの画面として構成し、下位の部品へ表示値と操作用コールバックをpropsで渡します。全体の構成とホストとの境界は[構成と描画経路](architecture.md)を参照してください。

パスはこの資料からの相対リンクです。部品の実装は `webview/components/`、状態とDOM連携のフックは `webview/hooks/` に置きます。

## 共通部品

| コンポーネント | 実装先 | 責務 |
| --- | --- | --- |
| `ToolButton` | [tool-button.tsx](../../webview/components/common/tool-button.tsx) | ツールバーボタン、ラベル、無効状態、マウス操作時の編集選択の保持 |
| `Dropdown` | [dropdown.tsx](../../webview/components/common/dropdown.tsx) | メニューの表示、位置調整、矢印キー、Escapeとフォーカスの復帰 |
| `Icon` | [icon.tsx](../../webview/components/common/icon.tsx) | ツールバーとサイドバーで使うSVGアイコン |
| `StatusMessage` | [status-message.tsx](../../webview/components/common/status-message.tsx) | 保存結果・検索状況などの読み上げ可能な状態メッセージ |

## 専用画面

| コンポーネント | 実装先 | 責務 |
| --- | --- | --- |
| `Workbench` | [workbench.tsx](../../webview/components/workbench/workbench.tsx) | 画面全体の組み立て、状態の購読、モードとショートカットの接続 |
| `Toolbar` | [toolbar.tsx](../../webview/components/workbench/toolbar.tsx) | 保存、書式操作、プレビュー情報、本文検索、モード切り替えの配置 |
| `FormattingToolbar` | [formatting-toolbar.tsx](../../webview/components/workbench/formatting-toolbar.tsx) | Undo / Redo、装飾・リスト・リンク・表・コード挿入の操作 |
| `HeadingMenu` | [heading-menu.tsx](../../webview/components/workbench/heading-menu.tsx) | 見出しレベル1〜7の選択 |
| `ImageMenu` | [image-menu.tsx](../../webview/components/workbench/image-menu.tsx) | ファイル選択・URLによる画像追加の選択、処理中の無効状態 |
| `PreviewInfo` | [preview-info.tsx](../../webview/components/workbench/preview-info.tsx) | タスクの完了数・総数と目次メニュー |
| `Outline` | [outline-menu.tsx](../../webview/components/workbench/outline-menu.tsx) | 見出しの階層表示、折りたたみ内の見出しへの移動 |
| `DocumentSearch` | [document-search.tsx](../../webview/components/workbench/document-search.tsx) | プレビュー内の検索欄、一致件数、前後への移動 |
| `ModeSwitch` | [mode-switch.tsx](../../webview/components/workbench/mode-switch.tsx) | 編集・プレビューの切り替えボタン |
| `ConflictNotice` | [conflict-notice.tsx](../../webview/components/workbench/conflict-notice.tsx) | 競合通知、最新文書と保持した入力の選択 |
| `EditorPane` | [editor-pane.tsx](../../webview/components/workbench/editor-pane.tsx) | CodeMirrorの生成・接続・破棄と、編集領域の表示切り替え |
| `Preview` | [preview.tsx](../../webview/components/workbench/preview.tsx) | サニタイズ済み本文の反映、タスク・リンク操作、見出しと完了数の収集 |

## サイドバー

| コンポーネント | 実装先 | 責務 |
| --- | --- | --- |
| `Explorer` | [explorer.tsx](../../webview/components/explorer/explorer.tsx) | サイドバー全体の組み立て、ファイル一覧・検索・ブックマークの表示切り替え |
| `ExplorerNavigation` | [explorer-navigation.tsx](../../webview/components/explorer/explorer-navigation.tsx) | 表示モード、一覧の更新、現在文書への追従の操作 |
| `FileTree` | [file-tree.tsx](../../webview/components/explorer/file-tree.tsx) | 階層、行選択、キーボードによる移動、文書追従時の表示位置 |
| `FileTreeItem` | [file-tree-item.tsx](../../webview/components/explorer/file-tree-item.tsx) | 1行分の表示、ARIA属性、項目数、表示中の印、操作部品の配置 |
| `ThemeIcon` | [theme-icon.tsx](../../webview/components/explorer/theme-icon.tsx) | ライト・ダーク用のファイル・フォルダーアイコン |
| `FileActions` | [file-actions.tsx](../../webview/components/explorer/file-actions.tsx) | 行内と右クリックメニューに共通するソース表示・ブックマーク操作 |
| `FileContextMenu` | [file-context-menu.tsx](../../webview/components/explorer/file-context-menu.tsx) | 右クリック・Shift+F10で開くメニューとフォーカスの管理 |
| `BookmarkList` | [bookmark-list.tsx](../../webview/components/explorer/bookmark-list.tsx) | ファイルツリーの行と操作を利用したブックマーク一覧 |
| `SearchBox` | [search-box.tsx](../../webview/components/explorer/search-box.tsx) | 本文検索の入力欄、クリア、IMEイベントの接続 |
| `SearchResults` | [search-results.tsx](../../webview/components/explorer/search-results.tsx) | 検索結果カードの一覧と検索中の状態 |
| `SearchResultCard` | [search-result-card.tsx](../../webview/components/explorer/search-result-card.tsx) | ファイル名・パス・一致行数と、文書を開く・ブックマーク・ソース表示の操作 |
| `Excerpt` | [search-excerpt.tsx](../../webview/components/explorer/search-excerpt.tsx) | 行番号・本文抜粋と一致語の強調 |

## 状態と処理の管理先

| 管理先 | 内容 |
| --- | --- |
| [WorkbenchController](../../webview/workbench-controller.ts) | ホストとの通信、保存・Undo / Redo・画像追加・モード切り替え前の反映待ち、画面状態とドラフトの復元 |
| [DocumentSession](../../webview/session.ts) | 入力、反映済み本文、文書バージョン、応答待ち、競合の管理 |
| [ExplorerController](../../webview/explorer-controller.ts) | サイドバーのホスト状態の購読、IME入力・検索IDの管理、表示モード・開閉・ファイル操作の依頼 |
| [useDocumentSearch](../../webview/hooks/use-document-search.ts) | プレビュー内の検索語・一致数・現在位置と本文DOMの強調処理の接続 |
| [useToolbarMenus](../../webview/hooks/use-toolbar-menus.ts) | ツールバーメニューの開閉、モード切り替えや外側のクリックによる閉じ操作 |
| [src/explorer.ts](../../src/explorer.ts) | ファイル取得、検索、ブックマークの永続化、文書追従、フォルダーの開閉状態 |
| [shared/messages.ts](../../shared/messages.ts) | 通信する値の型と実行時の検証 |

検索語・フォルダーの開閉状態・ブックマークなどを、表示用の部品へ別々に複製しないようにします。部品側の行選択・フォーカス・メニュー開閉と、ホスト側の永続化や検索処理の責務を区別してください。

## 画面を変更するとき

1. 上の表から対象部品を選び、見た目の調整はそのTSXと対応する `styles/` のCSSへ加えます。`webview/workbench.tsx` と `webview/explorer.tsx` はマウント・アンマウントを行う起動用エントリーとして保ちます。
2. 操作を追加する場合は部品のコールバックを画面またはコントローラーへ接続します。文書・ファイル操作が必要なら、通信型・実行時の検証・拡張ホスト側の処理も確認します。
3. CodeMirrorは表示モードが変わっても同じインスタンスを使います。Markdown本文のHTML反映と検索強調は `Preview` の独立したDOM領域に限定し、Reactが管理するツールバーや検索結果を直接書き換えないようにします。
4. [開発と検証](../development/testing.md)に従ってビルド・テスト・F5での確認を行い、変えた仕様に対応するWikiも更新します。

この資料はリポジトリ内の各コンポーネント・コントローラー・テストを基にしています。

## 関連資料

[Wikiホーム](../README.md) / [構成と描画経路](architecture.md) / [文書同期](document-sync.md) / [リソースと安全性](security.md)
