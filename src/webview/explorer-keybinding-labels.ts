import type { ExplorerPlatform, FileOperation } from '../shared/messages';

export type ExplorerShortcut = FileOperation | 'openTab' | 'openSide' | 'openPreview' | 'cancelCut' | 'contextMenu';
// Display defaults only. VS Code resolves actual keybindings from package.json and user settings.
export function explorerDefaultKeybindingLabel(action: ExplorerShortcut, platform: ExplorerPlatform): string | undefined {
  const mac = platform === 'mac', mod = mac ? '⌘' : 'Ctrl+';
  switch (action) {
    case 'copy': return `${mod}C`;
    case 'cut': return `${mod}X`;
    case 'paste': return `${mod}V`;
    case 'rename': return mac ? 'Enter' : 'F2';
    case 'delete': return mac ? '⌘Backspace' : 'Delete';
    case 'openTab': return mac ? '⌘↓' : 'Enter';
    case 'openPreview': return 'Space';
    case 'openSide': return 'Ctrl+Enter';
    case 'copyPath': return platform === 'windows' ? 'Shift+Alt+C' : mac ? '⌘⌥C' : 'Ctrl+Alt+C';
    case 'copyRelativePath': return platform === 'windows' ? 'Ctrl+K → Ctrl+Shift+C' : mac ? '⌘⌥⇧C' : 'Ctrl+Alt+Shift+C';
    case 'cancelCut': return 'Escape';
    case 'contextMenu': return 'Shift+F10';
  }
}
