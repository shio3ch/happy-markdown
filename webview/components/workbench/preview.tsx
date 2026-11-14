import { useLayoutEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { DocumentSnapshot, EditorMessage } from '../../../shared/messages';
import { headingTree } from '../../outline';
import type { HeadingNode } from '../../outline';

export type Heading = { level: number; label: string; element: HTMLElement };
export interface PreviewInfo { complete: number; total: number; headings: HeadingNode<Heading>[] }

export function Preview({ root, snapshot, hidden, send, onInfo }: {
  root: RefObject<HTMLElement | null>; snapshot?: DocumentSnapshot; hidden: boolean;
  send(message: EditorMessage): void; onInfo(info: PreviewInfo): void;
}) {
  const version = useRef<number>(undefined), pending = useRef(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const toggle = (event: Event) => {
      const box = event.target;
      if (!(box instanceof HTMLInputElement) || !box.matches('input[type="checkbox"][data-task]') || version.current === undefined || box.dataset.task === undefined) return;
      if (pending.current) { box.checked = !box.checked; return; }
      pending.current = true;
      element.querySelectorAll<HTMLInputElement>('input[data-task]').forEach(input => { input.disabled = true; });
      send({ type: 'toggle', id: box.dataset.task, checked: box.checked, version: version.current });
    };
    element.addEventListener('change', toggle);
    return () => element.removeEventListener('change', toggle);
  }, [root, send]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !snapshot) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.task : undefined;
    const scroll = element.scrollTop;
    const details = [...element.querySelectorAll('details')].map(item => item.open);
    // 拡張ホストのrenderMarkdownでサニタイズした本文のみを、この独立したDOM領域へ反映する。
    element.innerHTML = snapshot.html;
    element.querySelectorAll('details').forEach((item, index) => { if (index < details.length) item.open = details[index]; });
    version.current = snapshot.version; pending.current = false;
    const boxes = [...element.querySelectorAll<HTMLInputElement>('input[data-task]')];
    const headings = [...element.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].map(heading => ({
      level: Number(heading.dataset.headingLevel || heading.tagName.slice(1)), label: heading.textContent?.trim() || '（見出しなし）', element: heading,
    }));
    onInfo({ complete: boxes.filter(box => box.checked).length, total: boxes.length, headings: headingTree(headings) });
    boxes.find(box => box.dataset.task === focused)?.focus({ preventScroll: true });
    element.scrollTop = scroll;
  }, [snapshot, root, onInfo]);
  return <main id="document" aria-label="Markdownプレビュー" ref={root} hidden={hidden} onClick={event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) {
      try { root.current?.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView(); } catch {}
    } else send({ type: 'link', href });
  }} />;
}
