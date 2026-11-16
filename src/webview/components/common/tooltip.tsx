import { cloneElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createPortal } from 'react-dom';

export function Tooltip({ text, className = '', children }: {
  text: string; className?: string; children: ReactElement<{ 'aria-describedby'?: string }>;
}) {
  const id = useId(), trigger = useRef<HTMLSpanElement>(null), popup = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const close = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect(), rect = popup.current.getBoundingClientRect();
    popup.current.style.left = `${Math.max(4, Math.min(anchor.left + (anchor.width - rect.width) / 2, window.innerWidth - rect.width - 4))}px`;
    const top = anchor.bottom + 6 + rect.height <= window.innerHeight - 4 ? anchor.bottom + 6 : anchor.top - rect.height - 6;
    popup.current.style.top = `${Math.max(4, top)}px`;
  }, [open, text]);
  useEffect(() => {
    const dismiss = () => { clearTimeout(timer.current); setOpen(false); };
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss(); };
    window.addEventListener('keydown', keydown);
    window.addEventListener('blur', dismiss);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', dismiss);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, []);
  const description = [children.props['aria-describedby'], open ? id : undefined].filter(Boolean).join(' ') || undefined;
  return <span className={`tooltip-trigger ${className}`} ref={trigger} title=""
    onPointerEnter={event => { if (event.pointerType === 'touch') return; clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), 350); }}
    onPointerLeave={close} onPointerDown={close} onClickCapture={close}
    onFocus={() => { clearTimeout(timer.current); setOpen(true); }} onBlur={close}>
    {cloneElement(children, { 'aria-describedby': description })}
    {open && createPortal(<span id={id} className="explorer-tooltip" role="tooltip" ref={popup}>{text}</span>, document.body)}
  </span>;
}
