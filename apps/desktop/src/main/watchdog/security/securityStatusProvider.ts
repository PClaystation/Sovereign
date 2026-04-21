import type { SecurityStatusSnapshot } from '@main/watchdog/types';

import { MacosSecurityStatusProvider } from './macosSecurityStatusProvider';
import { WindowsSecurityStatusProvider } from './windowsSecurityStatusProvider';

export interface SecurityStatusProvider {
  read(): Promise<SecurityStatusSnapshot>;
}

export const createSecurityStatusProvider = (): SecurityStatusProvider | null => {
  if (process.platform === 'win32') {
    return new WindowsSecurityStatusProvider();
  }

  if (process.platform === 'darwin') {
    return new MacosSecurityStatusProvider();
  }

  return null;
};
