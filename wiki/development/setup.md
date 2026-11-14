# 開発環境

Node.js 22以上、npm、VS Code 1.100.0以上を使用します。拡張の対応バージョンと実行可能なスクリプトは `package.json` を確認してください。

```sh
npm ci
npm run typecheck
npm run build
npm test
```

`npm ci` は初回セットアップや依存変更時に実行します。アプリ本体はTypeScript、Webview UIはReact（TSX）で実装しています。`npm run typecheck` は拡張ホストとWebviewをそれぞれ `strict: true` で型検査します。拡張ホストは `tsc` で `dist/src/` と `dist/shared/` に出力し、WebviewはesbuildでReact・React DOM・CodeMirrorごとバンドルします。これらは開発依存に置き、実行時にCDNから取得しません。`npm run build` にも型検査が含まれ、`npm run clean` で `dist/` を削除してから新しい生成物を出力します。

自動テストはNode.js標準のテストランナーを使用します。`npm test` はビルド後のJavaScriptをCommonJSテストで検証します。React UIの回帰テストはjsdomで実際のバンドルとCodeMirrorを動かし、入力、競合、モード切り替え、ファイルツリーのキーボード操作、IME、フォーカス保持を確認します。ビルド起動用の `scripts/build.cjs` もCommonJSを維持しています。lint用のnpmスクリプトはありません。VS Code APIの型定義は、対応下限と同じ1.100.0に固定しています。

移行方法とビルド・型検査の分離は、[TypeScript公式のJavaScript移行ガイド](https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html)と[VS Code公式のバンドル手順](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)を参照しています。

## 関連資料

[Wikiホーム](../README.md) / [検証手順](testing.md) / [配布物の作成](packaging.md)
