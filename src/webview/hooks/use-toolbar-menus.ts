import { useEffect, useState } from 'react';

export function useToolbarMenus(mode: 'edit' | 'preview') {
  const [menu, setMenu] = useState<string>();
  useEffect(() => { setMenu(undefined); }, [mode]);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('.tool-dropdown')) setMenu(undefined);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
  return { isOpen: (id: string) => menu === id, open: (id: string) => setMenu(id), close: () => setMenu(undefined) };
}
export type ToolbarMenus = ReturnType<typeof useToolbarMenus>;
