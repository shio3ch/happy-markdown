import { useEffect, useSyncExternalStore } from 'react';
import type { ExplorerController } from '../../explorer-controller';
import { ExplorerNavigation } from './explorer-navigation';
import { SearchBox } from './search-box';
import { SearchResults } from './search-results';
import { FileTree } from './file-tree';
import { BookmarkList } from './bookmark-list';
import { ExplorerPlatformContext } from '../../hooks/use-explorer-platform';
import { StatusMessage } from '../common/status-message';

export function Explorer({ controller }: { controller: ExplorerController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  useEffect(() => controller.connect(window), [controller]);
  const platform = /Mac/i.test(navigator.platform) ? 'mac' : /Win/i.test(navigator.platform) ? 'windows' : /Linux/i.test(navigator.platform) ? 'linux' : state.platform || 'windows';
  const tree = { nodes: state.nodes, expandedIds: state.expandedIds, revealId: state.revealId, revealRevision: state.revealRevision,
    onExpand: controller.expand, onAction: controller.action, onFileOperation: controller.fileOperation, onMove: controller.move,
    treeCommand: state.treeCommand, treeCommandRevision: state.treeCommandRevision, focusId: state.focusId, focusRevision: state.focusRevision, onTreeFocus: controller.treeFocus, onSelection: controller.selection, cutId: state.cutId, canPaste: state.canPaste, writable: state.hasWorkspace && state.initialized, tools: state.mode === 'files' };
  return <ExplorerPlatformContext value={platform}><main aria-label="Markdownエクスプローラー">
    <ExplorerNavigation mode={state.mode} followActive={state.followActive} disabled={!state.initialized}
      onMode={controller.selectMode} onRefresh={controller.refresh} onFollow={controller.follow} />
    {state.mode === 'search' && <SearchBox query={state.query} disabled={!state.initialized} onChange={controller.changeQuery}
      onCompositionStart={controller.compositionStart} onCompositionEnd={controller.compositionEnd} />}
    <StatusMessage id="status" message={state.status} />
    {!state.hasWorkspace && state.initialized && <div className="empty-workspace"><p>Markdownを読むフォルダーを開いてください。</p><button type="button" onClick={controller.openFolder}>フォルダーを開く</button></div>}
    {state.mode === 'search' ? <SearchResults results={state.results} query={state.query} busy={state.busy} onAction={controller.action} />
      : state.mode === 'bookmarks' ? <BookmarkList {...tree} /> : <FileTree {...tree} />}
  </main></ExplorerPlatformContext>;
}
