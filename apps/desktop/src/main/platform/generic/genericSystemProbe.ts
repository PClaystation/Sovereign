import { SystemInformationProbe } from '@main/platform/common/systemInformationProbe';
import type { SystemProbe } from '@main/platform/systemProbe';

const IGNORED_FILESYSTEMS = new Set(['devfs', 'overlay', 'squashfs', 'tmpfs']);

export const createGenericSystemProbe = (): SystemProbe =>
  new SystemInformationProbe({
    platform:
      process.platform === 'darwin'
        ? 'macos'
        : process.platform === 'linux'
          ? 'linux'
          : 'unknown',
    volumeFilter: (volume) => !IGNORED_FILESYSTEMS.has(volume.filesystem.toLowerCase())
  });
