import type { ReactNode, RefObject } from 'react';
import type { WorkbenchController } from '../../workbench-controller';
import type { PreviewInfo as Info } from './preview';
import { useToolbarMenus } from '../../hooks/use-toolbar-menus';
import { ToolButton } from '../common/tool-button';
import { Icon } from '../common/icon';
import { FormattingToolbar } from './formatting-toolbar';
import { PreviewInfo } from './preview-info';
import { ModeSwitch } from './mode-switch';

export function Toolbar({ controller, state, info, root, search }: {
  controller: WorkbenchController; state: ReturnType<WorkbenchController['getSnapshot']>; info: Info;
  root: RefObject<HTMLElement | null>; search: ReactNode;
}) {
  const menus = useToolbarMenus(state.mode);
  return <header className="workbench-toolbar" aria-label="Markdownツールバー">
    <div id="toolbar-start">
      <ToolButton id="save" title="保存（Ctrl+S）" disabled={!state.ready} onClick={() => { void controller.action('save'); }}><Icon name="save" /></ToolButton>
      <FormattingToolbar ready={state.ready} hidden={state.mode !== 'edit'} imageBusy={state.imageBusy} menus={menus}
        onAction={controller.action} onFormat={controller.format} onPickImage={controller.pickImage} />
      <PreviewInfo info={info} root={root} ready={state.ready} hidden={state.mode !== 'preview'} menus={menus} />
    </div>
    {search}
    <ModeSwitch mode={state.mode} disabled={!state.ready || state.switching} onSwitch={controller.switchMode} />
  </header>;
}
