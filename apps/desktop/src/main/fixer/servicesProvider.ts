import type { ServiceSummary } from '@shared/models';

import { MacosServicesProvider } from './macos/macosServicesProvider';
import { WindowsServicesProvider } from './windows/windowsServicesProvider';

export interface ServicesProvider {
  list(): Promise<ServiceSummary[]>;
  startService(serviceName: string): Promise<void>;
  stopService(serviceName: string): Promise<void>;
  restartService(serviceName: string): Promise<void>;
}

export const createServicesProvider = (): ServicesProvider | null => {
  if (process.platform === 'win32') {
    return new WindowsServicesProvider();
  }

  if (process.platform === 'darwin') {
    return new MacosServicesProvider();
  }

  return null;
};
