import { useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Dropdown({ id, title, label, open, disabled, onOpen, onClose, children }: {
  id: string; title: string; label: ReactNode; open: boolean; disabled: boolean;
  onOpen(): void; onClose(): void; children: ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), options = useRef<HTMLDivElement>(null);
  const suppress = useRef(false), direction = useRef(0);
  useLayoutEffect(() => {
    if (!open || !options.current) return;
    options.current.style.left = '0px';
    const overflow = options.current.getBoundingClientRect().right - window.innerWidth + 12;
    if (overflow > 0) options.current.style.left = `${-overflow}px`;
    if (direction.current) {
      const buttons = options.current.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      (direction.current > 0 ? buttons[0] : buttons[buttons.length - 1])?.focus();
      direction.current = 0;
    }
  }, [open]);
  return <div className="tool-dropdown" id={`${id}-menu`} ref={container}
    onMouseEnter={() => { if (!disabled) onOpen(); }}
    onMouseLeave={() => { if (!container.current?.contains(document.activeElement)) onClose(); }}
    onFocus={() => { if (!suppress.current && !disabled) onOpen(); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onClose(); }}
    onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault(); onClose(); suppress.current = true; trigger.current?.focus(); suppress.current = false;
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        if (!open) { direction.current = step; onOpen(); return; }
        const buttons = [...options.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = buttons.findIndex(button => button === document.activeElement);
        if (buttons.length) buttons[index < 0 ? (step > 0 ? 0 : buttons.length - 1) : (index + step + buttons.length) % buttons.length].focus();
      }
    }}>
    <button id={id} ref={trigger} type="button" title={title} aria-label={title} disabled={disabled}
      aria-haspopup="true" aria-expanded={open} aria-controls={`${id}-options`}
      onMouseDown={event => event.preventDefault()} onClick={onOpen}>{label}</button>
    <div className="tool-options" id={`${id}-options`} ref={options} hidden={!open} aria-label={title}
      onMouseDown={event => event.preventDefault()}>{children}</div>
  </div>;
}
