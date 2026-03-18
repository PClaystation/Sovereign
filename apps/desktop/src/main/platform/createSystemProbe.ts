import type { SystemProbe } from '@main/platform/systemProbe';
import { createGenericSystemProbe } from '@main/platform/generic/genericSystemProbe';
import { createWindowsSystemProbe } from '@main/platform/windows/windowsSystemProbe';

export const createSystemProbe = (): SystemProbe =>
  process.platform === 'win32' ? createWindowsSystemProbe() : createGenericSystemProbe();
