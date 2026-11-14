import type { RefObject } from 'react';
import type { PreviewInfo as Info } from './preview';
import type { ToolbarMenus } from '../../hooks/use-toolbar-menus';
import { Dropdown } from '../common/dropdown';
import { Outline } from './outline-menu';

export function PreviewInfo({ info, root, ready, hidden, menus }: {
  info: Info; root: RefObject<HTMLElement | null>; ready: boolean; hidden: boolean; menus: ToolbarMenus;
}) {
  return <div id="preview-info" hidden={hidden}>
    <span id="progress" role="status">{info.complete}/{info.total}件のタスクが完了</span>
    <Dropdown id="toc" title="見出しの目次を表示" label="目次 ▾" open={menus.isOpen('toc')} disabled={!ready}
      onOpen={() => menus.open('toc')} onClose={menus.close}>
      {info.headings.length ? <Outline nodes={info.headings} root={root} close={menus.close} /> : <p className="toc-empty">見出しがありません</p>}
    </Dropdown>
  </div>;
}
