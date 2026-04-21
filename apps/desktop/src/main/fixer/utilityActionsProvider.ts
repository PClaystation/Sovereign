import type { RunUtilityActionRequest } from '@shared/ipc';

import { MacosUtilityActionsProvider } from './macos/macosUtilityActionsProvider';
import { WindowsUtilityActionsProvider } from './windows/windowsUtilityActionsProvider';

export interface UtilityActionsProvider {
  run(action: RunUtilityActionRequest['action']): Promise<void>;
}

export const createUtilityActionsProvider = (): UtilityActionsProvider | null => {
  if (process.platform === 'win32') {
    return new WindowsUtilityActionsProvider();
  }

  if (process.platform === 'darwin') {
    return new MacosUtilityActionsProvider();
  }

  return null;
};
