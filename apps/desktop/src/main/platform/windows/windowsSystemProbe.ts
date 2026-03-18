import { SystemInformationProbe } from '@main/platform/common/systemInformationProbe';
import type { SystemProbe } from '@main/platform/systemProbe';

export const createWindowsSystemProbe = (): SystemProbe =>
  new SystemInformationProbe({
    platform: 'windows',
    volumeFilter: (volume) => /^[A-Z]:/i.test(volume.mount) || /^[A-Z]:/i.test(volume.name)
  });
