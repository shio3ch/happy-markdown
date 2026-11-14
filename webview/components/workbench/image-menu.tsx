import { Dropdown } from '../common/dropdown';
import { Icon } from '../common/icon';
import type { ToolbarMenus } from '../../hooks/use-toolbar-menus';

export function ImageMenu({ ready, busy, menus, onPickFile, onInsertUrl }: {
  ready: boolean; busy: boolean; menus: ToolbarMenus; onPickFile(): void; onInsertUrl(): void;
}) {
  return <Dropdown id="image" title="画像を追加" label={<Icon name="image" />} open={menus.isOpen('image')} disabled={!ready}
    onOpen={() => menus.open('image')} onClose={menus.close}>
    <button type="button" id="image-file" disabled={busy} onClick={() => { menus.close(); onPickFile(); }}>ファイルから追加</button>
    <button type="button" id="image-url" onClick={onInsertUrl}>URLを入力</button>
  </Dropdown>;
}
