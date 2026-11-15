import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { WorkbenchController } from '../../workbench-controller';
import { EditorPane } from './editor-pane';
import { Preview } from './preview';
import type { PreviewInfo } from './preview';
import { Toolbar } from './toolbar';
import { DocumentSearch } from './document-search';
import { useDocumentSearch } from '../../hooks/use-document-search';
import { ConflictNotice } from './conflict-notice';
import { StatusMessage } from '../common/status-message';

export function Workbench({ controller }: { controller: WorkbenchController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const root = useRef<HTMLElement>(null);
  const [info, setInfo] = useState<PreviewInfo>({ complete: 0, total: 0, headings: [] });
  const search = useDocumentSearch(root, state.snapshot);
  useLayoutEffect(() => {
    document.body.dataset.mode = state.mode;
    if (state.ready && state.mode === 'edit') controller.focusEditor();
  }, [controller, state.mode, state.ready]);
  useEffect(() => controller.connect(window), [controller]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 's') { event.preventDefault(); void controller.action('save'); }
      if (key === 'f' && state.mode === 'preview') { event.preventDefault(); search.input.current?.focus(); search.input.current?.select(); }
      if (state.mode === 'preview' && (key === 'z' || key === 'y')) {
        event.preventDefault(); void controller.action(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [controller, state.mode, search.input]);
  return <>
    <Toolbar controller={controller} state={state} info={info} root={root}
      search={<DocumentSearch search={search} hidden={state.mode !== 'preview'} />} />
    <ConflictNotice visible={state.conflict} pending={state.pending} onResolve={controller.resolve} />
    <EditorPane controller={controller} hidden={state.mode !== 'edit'} />
    <Preview root={root} snapshot={state.snapshot} hidden={state.mode !== 'preview'} send={controller.send} onInfo={setInfo} />
    <StatusMessage id="message" message={state.message} />
  </>;
}
