# 画面コンポーネント

画面を変更するときの実装先をまとめます。専用画面とサイドバーはそれぞれReactの画面として構成し、下位の部品へ表示値と操作用コールバックをpropsで渡します。全体の構成とホストとの境界は[構成と描画経路](architecture.md)を参照してください。

パスはこの資料からの相対リンクです。部品の実装は `src/webview/components/`、状態とDOM連携のフックは `src/webview/hooks/` に置きます。

## 共通部品

| コンポーネント | 実装先 | 責務 |
| --- | --- | --- |
| `ToolButton` | [tool-button.tsx](../../src/webview/components/common/tool-button.tsx) | ツールバーボタン、ラベル、無効状態、マウス操作時の編集選択の保持 |
| `Dropdown` | [dropdown.tsx](../../src/webview/components/common/dropdown.tsx) | メニューの表示、位置調整、矢印キー、Escapeとフォーカスの復帰 |
| `Tooltip` | [tooltip.tsx](../../src/webview/components/common/tooltip.tsx) | サイドバーの操作説明。ホバー待機・フォーカス・Escape、ARIAの説明と画面内への配置 |
| `Icon` | [icon.tsx](../../src/webview/components/common/icon.tsx) | ツールバーとサイドバーで使うSVGアイコン |
| `StatusMessage` | [status-message.tsx](../../src/webview/components/common/status-message.tsx) | 保存結果・検索状況などの読み上げ可能な状態メッセージ |

## 専用画面

| コンポーネント | 実装先 | 責務 |
| --- | --- | --- |
| `Workbench` | [workbench.tsx](../../src/webview/components/workbench/workbench.tsx) | 画面全体の組み立て、状態の購読、モードとショートカットの接続 |
| `Toolbar` | [toolbar.tsx](../../src/webview/components/workbench/toolbar.tsx) | 保存、書式操作、プレビュー情報、本文検索、モード切り替えの配置 |
| `FormattingToolbar` | [formatting-toolbar.tsx](../../src/webview/components/workbench/formatting-toolbar.tsx) | Undo / Redo、装飾・リスト・リンク・表・コード挿入の操作 |
| `HeadingMenu` | [heading-menu.tsx](../../src/webview/components/workbench/heading-menu.tsx) | 見出しレベル1〜7の選択 |
| `ImageMenu` | [image-menu.tsx](../../src/webview/components/workbench/image-menu.tsx) | ファイル選択・URLによる画像追加の選択、処理中の無効状態 |
| `PreviewInfo` | [preview-info.tsx](../../src/webview/components/workbench/preview-info.tsx) | タスクの完了数・総数と目次メニュー |
| `Outline` | [outline-menu.tsx](../../src/webview/components/workbench/outline-menu.tsx) | 見出しの階層表示、折りたたみ内の見出しへの移動 |
| `DocumentSearch` | [document-search.tsx](../../src/webview/components/workbench/document-search.tsx) | プレビュー内の検索欄、一致件数、前後への移動 |
| `ModeSwitch` | [mode-switch.tsx](../../src/webview/components/workbench/mode-switch.tsx) | 編集・プレビューの切り替えボタン |
| `ConflictNotice` | [conflict-notice.tsx](../../src/webview/components/workbench/conflict-notice.tsx) | 競合通知、最新文書と保持した入力の選択 |
| `EditorPane` | [editor-pane.tsx](../../src/webview/components/workbench/editor-pane.tsx) | CodeMirrorの生成・接続・破棄と、編集領域の表示切り替え |
| `Preview` | [preview.tsx](../../src/webview/components/workbench/preview.tsx) | サニタイズ済み本文の反映、タスク・リンク操作、見出しと完了数の収集 |
| `AppearanceSettings` | [appearance-settings.tsx](../../src/webview/components/workbench/appearance-settings.tsx) | 外観設定モーダル、プリセット・配色・背景画像・JSON操作と表示サンプル |

## サイドバー

| コンポーネント | 実装先 | 責務 |
| --- | --- | --- |
| `Explorer` | [explorer.tsx](../../src/webview/components/explorer/explorer.tsx) | サイドバー全体の組み立て、ファイル一覧・検索・ブックマークの表示切り替え |
| `ExplorerNavigation` | [explorer-navigation.tsx](../../src/webview/components/explorer/explorer-navigation.tsx) | 表示モード、一覧の更新、現在文書への追従の操作 |
| `FileTree` | [file-tree.tsx](../../src/webview/components/explorer/file-tree.tsx) | 階層、行選択、作成ツールバー、キーボードによる移動・ファイル操作、ドラッグ移動、文書追従時の表示位置 |
| `FileTreeItem` | [file-tree-item.tsx](../../src/webview/components/explorer/file-tree-item.tsx) | 1行分の表示、ARIA属性、項目数、切り取り・ドロップ先の表示、操作部品の配置 |
| `ThemeIcon` | [theme-icon.tsx](../../src/webview/components/explorer/theme-icon.tsx) | ライト・ダーク用のファイル・フォルダーアイコン |
| `FileActions` | [file-actions.tsx](../../src/webview/components/explorer/file-actions.tsx) | 行内のソース表示・ブックマーク操作 |
| `FileContextMenu` | [file-context-menu.tsx](../../src/webview/components/explorer/file-context-menu.tsx) | ファイル・フォルダー・空白の操作メニュー、Portalによる配置とフォーカスの管理 |
| `BookmarkList` | [bookmark-list.tsx](../../src/webview/components/explorer/bookmark-list.tsx) | ファイルツリーの行と操作を利用したブックマーク一覧 |
| `SearchBox` | [search-box.tsx](../../src/webview/components/explorer/search-box.tsx) | 本文検索の入力欄、クリア、IMEイベントの接続 |
| `SearchResults` | [search-results.tsx](../../src/webview/components/explorer/search-results.tsx) | 検索結果カードの一覧と検索中の状態 |
| `SearchResultCard` | [search-result-card.tsx](../../src/webview/components/explorer/search-result-card.tsx) | ファイル名・パス・一致行数と、文書を開く・ブックマーク・ソース表示の操作 |
| `Excerpt` | [search-excerpt.tsx](../../src/webview/components/explorer/search-excerpt.tsx) | 行番号・本文抜粋と一致語の強調 |

## 状態と処理の管理先

| 管理先 | 内容 |
| --- | --- |
| [WorkbenchController](../../src/webview/workbench-controller.ts) | ホストとの通信、保存・Undo / Redo・画像追加・モード切り替え前の反映待ち、画面状態とドラフトの復元 |
| [DocumentSession](../../src/webview/session.ts) | 入力、反映済み本文、文書バージョン、応答待ち、競合の管理 |
| [live-preview.ts](../../src/webview/live-preview.ts) | CodeMirror内の構文装飾、選択行の記法表示、タスク操作。ReactやプレビューのHTML描画から独立 |
| [table-preview.ts](../../src/webview/table-preview.ts) | StateFieldによる表の表示、本文側の移動・入力とセル編集の接続 |
| [table-view.ts](../../src/webview/table-view.ts) | セルの直接入力、表・行・列の変更、DOM・フォーカス・IMEの維持、保存・Undo / Redoの接続 |
| [table-controls.ts](../../src/webview/table-controls.ts) | 行・列のホバーと操作メニュー、表オプション、ドラッグ・キーボード移動と配置の計測 |
| [table-cell.ts](../../src/webview/table-cell.ts) / [table-model.ts](../../src/webview/table-model.ts) | 許可した装飾の描画・Markdown変換、セルの範囲と行・列の差分計算 |
| [useExplorerTreeFocus](../../src/webview/hooks/use-explorer-tree-focus.ts) | 選択通知とフォーカス通知の順序、ウィンドウの再フォーカスと最後の行の復元、ボタン・入力欄のフォーカス保持 |
| [useExplorerPlatform](../../src/webview/hooks/use-explorer-platform.ts) / [explorer-keybinding-labels.ts](../../src/webview/explorer-keybinding-labels.ts) | クライアントOS別の既定キー表示。キー判定は行わない |
| [ExplorerController](../../src/webview/explorer-controller.ts) | サイドバーのホスト状態の購読、IME入力・検索IDの管理、表示モード・開閉・ファイル操作の依頼 |
| [useDocumentSearch](../../src/webview/hooks/use-document-search.ts) | プレビュー内の検索語・一致数・現在位置と本文DOMの強調処理の接続 |
| [useToolbarMenus](../../src/webview/hooks/use-toolbar-menus.ts) | ツールバーメニューの開閉、モード切り替えや外側のクリックによる閉じ操作 |
| [useAppearance](../../src/webview/hooks/use-appearance.ts) | 保存済み外観と試着の分離、外観通信、nonce付きテーマ変数の反映とキャンセル時の復元 |
| [src/extension/explorer.ts](../../src/extension/explorer.ts) | ファイル取得、検索、ブックマークの永続化、文書追従、フォルダーの開閉状態 |
| [src/extension/explorer-keybindings.ts](../../src/extension/explorer-keybindings.ts) | VS Codeのキーバインド用コンテキストを提供 |
| [src/extension/explorer-files.ts](../../src/extension/explorer-files.ts) | 空フォルダーの取得、ファイル操作とクリップボード、競合・パスの検証 |
| [src/shared/messages.ts](../../src/shared/messages.ts) | 通信する値の型と実行時の検証 |

検索語・フォルダーの開閉状態・ブックマークなどを、表示用の部品へ別々に複製しないようにします。部品側の行選択・フォーカス・メニュー開閉と、ホスト側の永続化や検索処理の責務を区別してください。

## 画面を変更するとき

1. 上の表から対象部品を選び、見た目の調整はそのTSXと対応する `styles/` のCSSへ加えます。`src/webview/workbench.tsx` と `src/webview/explorer.tsx` はマウント・アンマウントを行う起動用エントリーとして保ちます。
2. 操作を追加する場合は部品のコールバックを画面またはコントローラーへ接続します。文書・ファイル操作が必要なら、通信型・実行時の検証・拡張ホスト側の処理も確認します。
3. CodeMirrorは表示モードが変わっても同じインスタンスを使います。Markdown本文のHTML反映と検索強調は `Preview` の独立したDOM領域に限定し、Reactが管理するツールバーや検索結果を直接書き換えないようにします。
4. [開発と検証](../development/testing.md)に従ってビルド・テスト・F5での確認を行い、変えた仕様に対応するWikiも更新します。

この資料はリポジトリ内の各コンポーネント・コントローラー・テストを基にしています。

## 関連資料

[Wikiホーム](../README.md) / [構成と描画経路](architecture.md) / [文書同期](document-sync.md) / [リソースと安全性](security.md)
