import type { StartupBackupSummary } from '@shared/models';
import type { StartupItemRecord } from '@main/watchdog/types';

import { MacosStartupItemsProvider } from './macosStartupItemsProvider';
import { WindowsStartupItemsProvider } from './windowsStartupItemsProvider';

export interface StartupItemsProvider {
  list(): Promise<StartupItemRecord[]>;
  disable(item: StartupItemRecord, backupsDirectory: string): Promise<void>;
  listBackups(backupsDirectory: string): Promise<StartupBackupSummary[]>;
  restore(backupId: string, backupsDirectory: string): Promise<StartupBackupSummary>;
}

export const createStartupItemsProvider = (): StartupItemsProvider | null => {
  if (process.platform === 'win32') {
    return new WindowsStartupItemsProvider();
  }

  if (process.platform === 'darwin') {
    return new MacosStartupItemsProvider();
  }

  return null;
};

export const getStartupInventorySourceDescription = (): string => {
  if (process.platform === 'win32') {
    return 'Win32_StartupCommand plus startup folders';
  }

  if (process.platform === 'darwin') {
    return 'LaunchAgents and LaunchDaemons plist files';
  }

  return 'Unsupported platform';
};
