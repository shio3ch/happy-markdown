# エージェント開発ルール

## プロジェクトの目的と範囲

- Happy Markdown は、ObsidianのようなリッチなMarkdown編集体験を目指すVS Code拡張機能。
- 専用画面はCustom EditorとCodeMirrorを使用する。VS Code標準Markdownプレビューには共通CSSを適用する。
- この2つの表示経路を区別し、変更がどちらに影響するかを確認する。
- プロジェクトの目的は `README.md`、構成・現在の仕様・開発手順は [wiki/README.md](wiki/README.md)、コマンド・拡張の登録情報は `package.json` を確認する。
- WYSIWYG、Mermaid、他拡張の描画機能の継承など、未実装の機能を対応済みとして説明しない。

## 作業の進め方

- 完了報告では変更内容、検証結果、未確認事項を簡潔に伝える。実行していない検証を成功扱いしない。
- 最初に `git status --short` と対象コード・既存テストを確認する。ユーザーの未コミット変更や未追跡ファイルを保持する。
- 依頼された範囲の実装、検証、必要なドキュメント更新まで進める。通常の可逆な編集や検証で毎回確認を求めない。
- 判断可能な細部は既存実装に合わせる。要件やデータ損失の可能性に関わる曖昧さは確認する。
- 無関係なリファクタリング、全体整形、依存更新、バージョン変更を混ぜない。
- 依存追加は既存の仕組みで対応できるか確認し、追加する場合は目的を説明する。npmを使用し、依存変更時は `package-lock.json` も更新する。

## 構成と実装方針

構成と各ファイルの責務は [wiki/design/architecture.md](wiki/design/architecture.md) を参照する。

- アプリ本体はTypeScript、WebviewのUIはReact（TSX）で記述し、既存の命名・スタイルに合わせる。型検査はstrictを維持し、依頼なく別フレームワークへ移行しない。テストとビルド起動スクリプトは既存のCommonJS形式を使用する。
- VS Code APIへの依存は拡張ホスト側に置き、Webviewへ直接持ち込まない。ReactはWebviewだけで使用する。CodeMirrorはEffectで生成・破棄し、モード切り替えでは再生成しない。文書同期は `DocumentSession` とコントローラーに分離し、Reactの描画タイミングに依存させない。
- サイドバーのファイル一覧・検索・ブックマークは、1つのWebviewView内にReactコンポーネントとして実装する。モード切り替えやファイル操作は検証済みのメッセージでホストへ依頼し、ツリーの開閉状態・追従・キーボード操作を維持する。検索条件と本文検索処理は `src/workspace-search.ts` に分離し、入力ID・検索世代の整合性を維持する。
- UI部品は `webview/components/common`、`webview/components/workbench`、`webview/components/explorer` に分ける。画面の起動用エントリーに部品の実装を集めず、状態やDOM連携のフックは `webview/hooks` に置く。
- `dist/` は生成物。直接編集せず `npm run build` で生成する。ビルドは `npm run clean` で以前の生成物を消してから出力し、廃止したバンドルを配布物へ残さない。
- UIの文言は日本語を基本とし、ライト・ダークテーマ、キーボード操作、フォーカス表示を維持する。

## 文書を壊さないための条件

- VS Codeの `TextDocument` を文書の基準とする。編集は既存の `WorkspaceEdit` 経路を使い、ファイルへの直接書き込みで文書履歴を迂回しない。
- 同期メッセージの文書バージョンと応答IDの整合性を守る。古い応答で新しい入力を上書きしない。
- 外部編集との競合や書き込み失敗では入力中の内容を保持する。ユーザーの選択なしに破棄・上書きしない。
- 保存・自動保存・Undo / Redoとの連携、LF / CRLF、モード切り替え時の未保存入力とカーソル位置を維持する。
- タスクのチェック操作は対象のMarkdown記法だけを編集する。
- 画像追加では元画像を変更しない。コピーした画像の削除がUndo対象外である点を維持・説明する。

## Webviewの安全性

- Markdown・HTML・URL・Webviewからのメッセージを信頼済み入力として扱わない。型、識別子、バージョンなどを用途に応じて検証する。
- HTMLサニタイズとCSPを維持する。表示不具合の回避目的でスクリプト・イベント属性や任意のURIスキームを許可しない。
- ローカルリソースは既存の `asWebviewUri` 経路を使い、`localResourceRoots` を必要以上に広げない。
- Reactと編集エンジンは拡張に同梱する。CDN依存や文書内容の外部送信を追加しない。Markdown内のHTTPS画像読み込みとは区別する。
- 配布物に必要な第三者ライセンスを保持する。

## 開発と検証

前提はNode.js 22以上、npm、VS Code 1.100.0以上。実際の対応範囲は `package.json` と `wiki/development/setup.md` に合わせる。

```sh
npm ci
npm run typecheck
npm run build
npm test
```

- `npm ci` は初回セットアップや依存変更時に実行する。
- TypeScript・JavaScriptや依存関係を変更したら `npm run build` と `npm test` を実行する。不具合修正では、可能なら修正前に失敗する回帰テストを追加する。
- 対象を絞る場合は `npm run build` 後に `node --test test/session.test.js` のように実行できる。テストは `dist/` の生成物を読み込む。実装と同じ計算をなぞるだけのテストではなく、期待する挙動を検証する。
- 文書のみの変更では記載内容・パス・コマンドの整合性を確認する。無関係なテスト追加は不要。
- 型検査は `npm run typecheck`。`tsconfig.json` は拡張ホストと共有コード、`webview/tsconfig.json` はWebviewのTS・TSXと共有コードを対象にする。`npm run build` にも型検査を含む。lint用のnpmスクリプトはない。
- UI変更時はF5で拡張開発ホストを起動し、`wiki/README.md` を入口に対象機能を確認する。F5では `wiki` フォルダーがワークスペースとして開かれ、起動前タスクでビルドされる。変更後は再ビルドして開発ホストを再読み込みする。
- F5のデバッグ設定は一時プロファイルで他のインストール済み拡張を無効にする。他拡張との併用確認や起動失敗の調査手順は `wiki/development/testing.md` を参照する。
- 編集・同期変更時は、連続入力、外部編集との競合、保存、Undo / Redo、モード切り替えを重点確認する。表示変更時はライト・ダーク、キーボード操作を確認する。
- React UIの回帰テストはjsdomでビルド済みWebviewを動かす。jsdomは画面レイアウト・実際のCSPを検証しないため、VS Code上の確認と区別する。
- 自動テストの成功をVS Code上の動作確認と同一視しない。GUIを確認できなかった場合は未確認と明記する。

## ドキュメントとGit

- 目的や開発状況の要約を変更したら `README.md` を更新する。READMEには使い方やファイル構成の詳細を追加しない。
- 構成・仕様・開発手順を変更したら対応する `wiki/` の資料を更新し、必要に応じて `examples/` も更新する。
- 構成や検証コマンドが変わったら、このファイルも更新する。
- コミットする場合は `fix: 同期競合時の入力保持を修正` のように、作業種別と日本語の要約を使う。
- PR作成時は「概要」「作業内容の詳細」「検証内容」「その他、補足事項など」で日本語の説明を書く。未実施の検証も明示する。
- コミット・push・PR作成はユーザーから依頼された範囲で行う。無関係なファイルを一括でステージしない。
- 配布確認が必要なときは `npm run package` でVSIXを作成する。Marketplaceへの公開は現在の運用に含まない。

## 参考

- Codexのルール配置・読み込み仕様: [OpenAI公式ドキュメント — Custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- プロジェクト固有の記述はリポジトリ内の `README.md`、`wiki/`、`package.json`、実装・テストを根拠とする。
