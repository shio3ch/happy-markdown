# リソースと安全性

HTMLサニタイズとWebviewのCSPで、Markdown由来のスクリプトやイベント属性を実行させない設計です。ローカルリソースは `asWebviewUri` を通して参照します。

編集エンジンは拡張に同梱し、実行時にCDNからライブラリを取得したり文書を外部サービスへ送信したりしません。Markdown内で参照されたHTTPS画像は、その配信元から読み込みます。

ブラウザー向けコードは `dist/workbench.js` にバンドルされ、同梱ライブラリのライセンスは `dist/THIRD_PARTY_LICENSES.txt` に出力されます。

## 関連資料

[Wikiホーム](../README.md) / [構成と描画経路](architecture.md) / [配布物の作成](../development/packaging.md)
