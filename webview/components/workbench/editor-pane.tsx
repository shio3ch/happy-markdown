import { useLayoutEffect, useRef } from 'react';
import { createEditor } from '../../editor';
import type { WorkbenchController } from '../../workbench-controller';

export function EditorPane({ controller, hidden }: { controller: WorkbenchController; hidden: boolean }) {
  const parent = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const editor = createEditor(parent.current!, controller.edit, {
      save: () => { void controller.action('save'); }, undo: () => { void controller.action('undo'); }, redo: () => { void controller.action('redo'); },
    });
    const detach = controller.attachEditor(editor);
    return () => { detach(); editor.destroy(); };
  }, [controller]);
  return <div id="editor" hidden={hidden} ref={parent} aria-label="Markdownテキストエディター" />;
}
