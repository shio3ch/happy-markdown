export function ConflictNotice({ visible, pending, onResolve }: {
  visible: boolean; pending: boolean; onResolve(useDraft: boolean): void;
}) {
  return <section id="conflict" role="alert" hidden={!visible}>
    <span>別の場所で文書が更新されたか、変更を反映できませんでした。入力中の内容は保持しています。</span>
    <button id="use-latest" disabled={pending} onClick={() => onResolve(false)}>最新の文書を読み込む</button>
    <button id="use-draft" disabled={pending} onClick={() => onResolve(true)}>入力中の内容を反映</button>
  </section>;
}
