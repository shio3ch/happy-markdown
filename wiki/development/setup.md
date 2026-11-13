# 開発環境

Node.js 22以上、npm、VS Code 1.100.0以上を使用します。拡張の対応バージョンと実行可能なスクリプトは `package.json` を確認してください。

```sh
npm ci
npm run build
npm test
```

`npm ci` は初回セットアップや依存変更時に実行します。ビルドはesbuild、自動テストはNode.js標準のテストランナーを使用します。現在、lint・型チェックのnpmスクリプトはありません。

## 関連資料

[Wikiホーム](../README.md) / [検証手順](testing.md) / [配布物の作成](packaging.md)
