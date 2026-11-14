# 配布物の作成

```sh
npm run package
```

VSIX作成時は `vscode:prepublish` によってビルドが実行されます。出力名は `package.json` の名前とバージョンに従います。現在の運用ではMarketplaceへの公開は行いません。

`dist/` は直接編集せず生成します。`package.json` の `main` が指す `dist/src/extension.js`、その依存先の `dist/src/`・`dist/shared/`、Webviewバンドルと第三者ライセンスが配布物に含まれることを確認してください。TypeScriptソース、型検査設定、ソースマップ、テスト用の `dist/webview/` は `.vscodeignore` で除外します。開発資料の `wiki/` と `AGENTS.md` は `.vscodeignore` で除外します。

## 関連資料

[Wikiホーム](../README.md) / [開発環境](setup.md) / [安全性](../design/security.md)
