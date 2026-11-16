import { createContext, useContext } from 'react';
import type { ExplorerPlatform } from '../../shared/messages';
import { explorerDefaultKeybindingLabel } from '../explorer-keybinding-labels';

export const ExplorerPlatformContext = createContext<ExplorerPlatform>('windows');
export function useExplorerPlatform() { return useContext(ExplorerPlatformContext); }
export function useExplorerDefaultKeybindingLabel() {
  const platform = useExplorerPlatform();
  return (action: Parameters<typeof explorerDefaultKeybindingLabel>[0]) => explorerDefaultKeybindingLabel(action, platform);
}
