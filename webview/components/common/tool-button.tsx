import type { ReactNode } from 'react';

export function ToolButton({ id, title, children, disabled, onClick }: {
  id: string; title: string; children: ReactNode; disabled: boolean; onClick(): void;
}) {
  return <button id={id} className="tool-button" type="button" title={title} aria-label={title} disabled={disabled}
    onMouseDown={event => event.preventDefault()} onClick={onClick}>{children}</button>;
}
