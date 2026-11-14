import { Dropdown } from '../common/dropdown';
import type { ToolbarMenus } from '../../hooks/use-toolbar-menus';

export function HeadingMenu({ ready, menus, onSelect }: { ready: boolean; menus: ToolbarMenus; onSelect(level: number): void }) {
  return <Dropdown id="heading" title="見出しレベルを選択" label="見出し ▾" open={menus.isOpen('heading')} disabled={!ready}
    onOpen={() => menus.open('heading')} onClose={menus.close}>
    {Array.from({ length: 7 }, (_, index) => <button type="button" key={index} data-heading={index + 1}
      title={index === 6 ? '見出し7（専用画面の拡張記法）' : `見出し${index + 1}`} onClick={() => onSelect(index + 1)}>
      <strong>H{index + 1}</strong> 見出し {index + 1}{index === 6 && <small>拡張</small>}
    </button>)}
  </Dropdown>;
}
