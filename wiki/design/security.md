# リソースと安全性

HTMLサニタイズとWebviewのCSPで、Markdown由来のスクリプトやイベント属性を実行させない設計です。ローカルリソースは `asWebviewUri` を通して参照します。

React・React DOMと編集エンジンは拡張に同梱し、実行時にCDNからライブラリを取得したり文書を外部サービスへ送信したりしません。Markdown内で参照されたHTTPS画像は、その配信元から読み込みます。

ブラウザー向けコードは `dist/workbench.js` と `dist/explorer.js` にバンドルされ、両方の同梱ライブラリのライセンスは `dist/THIRD_PARTY_LICENSES.txt` に出力されます。

サイドバーのローカル画像は `media/explorer` 配下を `asWebviewUri` で参照し、その範囲だけを `localResourceRoots` に追加します。フォルダーの開閉やファイル操作は、表示用データ内のIDをホストが照合してから実行します。

Reactが生成するUIではファイル名や抜粋をテキストとして描画します。Markdown本文を挿入する領域はReactの管理するUIから分離し、拡張ホストの `renderMarkdown` でサニタイズしたHTMLだけを使用します。CSPのスクリプト・スタイルの許可範囲はReact導入前と同じです。サイドバーの画像はWebviewのローカルリソースに限定し、外部画像を許可しません。

## 関連資料

[Wikiホーム](../README.md) / [構成と描画経路](architecture.md) / [配布物の作成](../development/packaging.md)
