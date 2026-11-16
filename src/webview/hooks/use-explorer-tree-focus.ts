import { useCallback, useEffect, useRef } from 'react';
import type { FocusEvent, RefObject } from 'react';

export function useExplorerTreeFocus(tree: RefObject<HTMLUListElement | null>, select: (id?: string) => void, notify?: (focused: boolean) => void) {
  const lastTarget = useRef<HTMLElement>(undefined);
  const update = useCallback((target: EventTarget | null) => {
    const element = target instanceof HTMLElement ? target : undefined;
    const focused = Boolean(element && tree.current?.contains(element) && element.matches('[role="treeitem"], [role="tree"]'));
    // The host must know the target before it enables shortcuts for the tree.
    if (focused) { lastTarget.current = element; select(element?.dataset.entry); }
    else if (element && element !== document.body && element !== document.documentElement) lastTarget.current = undefined;
    notify?.(focused);
  }, [tree, select, notify]);
  useEffect(() => {
    const focus = () => {
      if (!document.hasFocus()) return update(null);
      const active = document.activeElement, last = lastTarget.current;
      // VS Code may reset the inner document to body when switching editor groups.
      if ((active === document.body || active === document.documentElement) && last?.isConnected && tree.current?.contains(last)) {
        last.focus();
        return;
      }
      update(active);
    };
    const blur = () => notify?.(false);
    window.addEventListener('focus', focus); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('focus', focus); window.removeEventListener('blur', blur); blur(); };
  }, [tree, update, notify]);
  return {
    onFocusCapture: (event: FocusEvent<HTMLUListElement>) => update(event.target),
    onBlurCapture: (event: FocusEvent<HTMLUListElement>) => update(event.relatedTarget),
  };
}
