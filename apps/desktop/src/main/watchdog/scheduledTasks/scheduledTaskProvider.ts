import type { ScheduledTaskRecord } from '@main/watchdog/types';

import { MacosScheduledTaskProvider } from './macosScheduledTaskProvider';
import { WindowsScheduledTaskProvider } from './windowsScheduledTaskProvider';

export interface ScheduledTaskProvider {
  list(): Promise<ScheduledTaskRecord[]>;
}

export const createScheduledTaskProvider = (): ScheduledTaskProvider | null => {
  if (process.platform === 'win32') {
    return new WindowsScheduledTaskProvider();
  }

  if (process.platform === 'darwin') {
    return new MacosScheduledTaskProvider();
  }

  return null;
};

export const getScheduledTaskInventorySourceDescription = (): string => {
  if (process.platform === 'win32') {
    return 'Get-ScheduledTask and Get-ScheduledTaskInfo';
  }

  if (process.platform === 'darwin') {
    return 'Readable launchd plist files with scheduled triggers';
  }

  return 'Unsupported platform';
};

export const getScheduledTaskPlatformLabel = (): string =>
  process.platform === 'darwin' ? 'scheduled launch jobs' : 'scheduled tasks';
