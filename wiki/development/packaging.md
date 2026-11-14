# 配布物の作成

```sh
npm run package
```

VSIX作成時は `vscode:prepublish` によってビルドが実行されます。出力名は `package.json` の名前とバージョンに従います。現在の運用ではMarketplaceへの公開は行いません。

`dist/` は直接編集せず生成します。`package.json` の `main` が指す `dist/src/extension.js`、その依存先の `dist/src/`・`dist/shared/`、Webviewバンドルと第三者ライセンスが配布物に含まれることを確認してください。TypeScriptソース、型検査設定、ソースマップ、テスト用の `dist/webview/` は `.vscodeignore` で除外します。開発資料の `wiki/` と `AGENTS.md` は `.vscodeignore` で除外します。

## 同梱する生成物とリソース

| 場所 | 用途 |
| --- | --- |
| `dist/src/` / `dist/shared/` | 拡張ホストと共有する通信処理 |
| `dist/workbench.js` | 専用画面のReact・CodeMirrorを含むバンドル |
| `dist/explorer.js` | ファイル一覧・検索・ブックマークを統合したサイドバーのReactバンドル |
| `dist/THIRD_PARTY_LICENSES.txt` | 両Webviewに同梱したライブラリのライセンス |
| バンドルとともに出力された `*.LEGAL.txt` | esbuildが分離したライセンスコメント。バンドルからの参照先を同梱する |
| `styles/` / `media/` | 標準プレビューと専用画面・サイドバーのCSS、ライト・ダーク用のローカルアイコン |

React・React DOM・CodeMirrorは開発依存に置き、WebviewのJavaScriptへバンドルして配布します。VSIX内の `node_modules/` にそれらの開発用パッケージが含まれていなくても、バンドルとライセンスは必要です。

ビルドは型検査の後に `npm run clean` で `dist/` を削除してから出力します。以前の検索専用バンドル `dist/explorer-search.js` など、廃止した生成物がVSIXに残っていないことも確認します。

## 関連資料

[Wikiホーム](../README.md) / [開発環境](setup.md) / [安全性](../design/security.md)
