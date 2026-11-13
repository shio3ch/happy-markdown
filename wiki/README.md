# Happy Markdown プロジェクトWiki

開発者とエージェントが参照する、実装・設計・検証のための資料です。プロジェクトの目的は[README](../README.md)、作業時のルールは[AGENTS.md](../AGENTS.md)を参照してください。

## できることから探す

[できること一覧 — ユースケース](features/use-cases.md)に、文書を探す・読む・編集する・保存する場面ごとの操作と結果をまとめています。初めて使う場合は、こちらを入口にしてください。

## 設計

| 資料 | 内容 |
| --- | --- |
| [構成と描画経路](design/architecture.md) | ファイルの責務、専用画面と標準プレビュー |
| [文書同期](design/document-sync.md) | 文書の基準、競合、保存、Undo / Redo |
| [リソースと安全性](design/security.md) | CSP、サニタイズ、ローカルリソース、ライセンス |

## 機能仕様

| 資料 | 内容 |
| --- | --- |
| [編集機能](features/editing.md) | CodeMirror、装飾の挿入、画像 |
| [プレビュー](features/viewer/preview.md) | 表示、本文検索、目次、チェックリスト |
| [エクスプローラー](features/viewer/explorer.md) | ファイル一覧、全Markdownの本文検索、ブックマーク |
| [現在の仕様と未対応の範囲](features/limitations.md) | 目標と実装済み機能の区別、互換性の制約 |

## 開発手順

| 資料 | 内容 |
| --- | --- |
| [開発環境](development/setup.md) | 前提環境、依存導入、ビルド |
| [開発と検証](development/testing.md) | 自動テスト、デバッグ起動、Wikiでの手動確認 |
| [配布物の作成](development/packaging.md) | VSIX作成、同梱物、配布方針 |

## Wikiの構成と運用

デバッグ時はこの `wiki` フォルダーをワークスペースとして開きます。`design`、`features`、`development` の分類と、その下の `features/viewer` の階層を使ってフォルダー表示を確認できます。本文検索やブックマークの確認にも実際の資料を使います。

作業前に対象領域の資料と実装を確認してください。構成・仕様・開発手順を変更した場合は、対応するWikiも更新します。将来の目標と実装済みの仕様は区別して記載します。

プロジェクト名・表示名は `Happy Markdown`、パッケージ名は `happy-markdown`、publisherは `shio3ch`、コマンドとビューの識別子は `happyMarkdown.*` です。リポジトリは `shio3ch/happy-markdown` を使用します。

このWikiはリポジトリ内の実装、テスト、既存のプロジェクト資料を基にしています。
