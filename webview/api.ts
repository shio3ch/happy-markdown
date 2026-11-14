import type { EditorMessage, ExplorerMessage } from '../shared/messages';

export interface WorkbenchState { mode: 'edit' | 'preview'; draft: string; baseText: string }
export interface WebviewApi {
  postMessage(message: EditorMessage | ExplorerMessage): void;
  getState(): unknown;
  setState(state: WorkbenchState): void;
}
