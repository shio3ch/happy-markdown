import type { EditorMessage, SearchMessage } from '../shared/messages';

declare global {
  function acquireVsCodeApi(): {
    postMessage(message: EditorMessage | SearchMessage): void;
    getState(): unknown;
    setState(state: { mode: 'edit' | 'preview'; draft: string; baseText: string }): void;
  };
}
