import type { ReactNode } from 'react';
import type { DocumentAction } from '../../../shared/messages';
import type { Format } from '../../formatting';
import type { ToolbarMenus } from '../../hooks/use-toolbar-menus';
import { ToolButton } from '../common/tool-button';
import { Icon } from '../common/icon';
import { HeadingMenu } from './heading-menu';
import { ImageMenu } from './image-menu';

export function FormattingToolbar({ ready, hidden, imageBusy, menus, onAction, onFormat, onPickImage }: {
  ready: boolean; hidden: boolean; imageBusy: boolean; menus: ToolbarMenus;
  onAction(type: DocumentAction): void; onFormat(kind: Format, value?: number | string): void; onPickImage(): void;
}) {
  const format = (kind: Format, value?: number | string) => { onFormat(kind, value); menus.close(); };
  const button = (id: Format, title: string, content: ReactNode) =>
    <ToolButton id={id} title={title} disabled={!ready} onClick={() => format(id)}>{content}</ToolButton>;
  return <span id="edit-actions" hidden={hidden}>
    <ToolButton id="undo" title="元に戻す（Ctrl+Z）" disabled={!ready} onClick={() => onAction('undo')}><Icon name="undo" /></ToolButton>
    <ToolButton id="redo" title="やり直す（Ctrl+Shift+Z）" disabled={!ready} onClick={() => onAction('redo')}><Icon name="redo" /></ToolButton>
    <HeadingMenu ready={ready} menus={menus} onSelect={level => format('heading', level)} />
    {button('bold', '太字', <Icon name="bold" />)}{button('italic', '斜体', <Icon name="italic" />)}{button('underline', '下線', <Icon name="underline" />)}{button('strike', '取り消し線', <Icon name="strike" />)}
    {button('inline-code', 'インラインコード', <Icon name="inline" />)}
    {button('bullet-list', '箇条書きリスト', <Icon name="bullet" />)}{button('ordered-list', '番号付きリスト', <Icon name="ordered" />)}
    {button('quote', '引用', <Icon name="quote" />)}{button('horizontal-rule', '水平線', <Icon name="hr" />)}{button('link', 'リンク', <Icon name="link" />)}
    <ImageMenu ready={ready} busy={imageBusy} menus={menus} onPickFile={onPickImage} onInsertUrl={() => format('image-url')} />
    {button('table', 'テーブル', <Icon name="table" />)}{button('code', 'コードスニペット', <Icon name="code" />)}
  </span>;
}
