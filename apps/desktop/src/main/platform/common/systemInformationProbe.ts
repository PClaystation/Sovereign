import os from 'node:os';

import si from 'systeminformation';

import type {
  DiskVolume,
  PlatformKey,
  ProcessInfo,
  SystemMetricsSnapshot
} from '@shared/models';
import {
  HEALTH_RULES,
  buildSystemHealthSummary,
  getNetworkStatus,
  getPercentStatus,
  getResourceAdvice
} from '@main/services/healthRules';
import type { SystemProbe } from '@main/platform/systemProbe';

interface ProbeProfile {
  platform: PlatformKey;
  volumeFilter: (volume: DiskVolume) => boolean;
}

const clampPercentage = (value: number): number =>
  Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

const mapVolume = (volume: si.Systeminformation.FsSizeData): DiskVolume => ({
  name: volume.fs || volume.mount || 'Unknown volume',
  mount: volume.mount || volume.fs || 'Unknown mount',
  filesystem: volume.type || 'unknown',
  sizeBytes: volume.size || 0,
  usedBytes: volume.used || 0,
  usagePercent: clampPercentage(volume.use || 0)
});

const sortProcesses = (left: ProcessInfo, right: ProcessInfo): number => {
  if (right.cpuPercent !== left.cpuPercent) {
    return right.cpuPercent - left.cpuPercent;
  }

  return right.memoryBytes - left.memoryBytes;
};

export class SystemInformationProbe implements SystemProbe {
  constructor(private readonly profile: ProbeProfile) {}

  async collectSnapshot(): Promise<SystemMetricsSnapshot> {
    const [cpuLoad, memoryStats, diskStats, networkStats, processStats] =
      await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.processes()
      ]);

    const cpuUsagePercent = clampPercentage(cpuLoad.currentLoad);
    const memoryUsedBytes = memoryStats.active || memoryStats.used || 0;
    const memoryTotalBytes = memoryStats.total || 0;
    const memoryUsagePercent =
      memoryTotalBytes > 0 ? clampPercentage((memoryUsedBytes / memoryTotalBytes) * 100) : 0;

    const volumes = diskStats
      .map(mapVolume)
      .filter((volume) => volume.sizeBytes > 0)
      .filter(this.profile.volumeFilter);

    const diskTotalBytes = volumes.reduce((sum, volume) => sum + volume.sizeBytes, 0);
    const diskUsedBytes = volumes.reduce((sum, volume) => sum + volume.usedBytes, 0);
    const diskUsagePercent =
      diskTotalBytes > 0 ? clampPercentage((diskUsedBytes / diskTotalBytes) * 100) : 0;

    const receiveBytesPerSec = networkStats.reduce(
      (sum, stat) => sum + Math.max(0, stat.rx_sec || 0),
      0
    );
    const transmitBytesPerSec = networkStats.reduce(
      (sum, stat) => sum + Math.max(0, stat.tx_sec || 0),
      0
    );
    const totalBytesPerSec = receiveBytesPerSec + transmitBytesPerSec;

    const cpuStatus = getPercentStatus(cpuUsagePercent, HEALTH_RULES.cpu);
    const memoryStatus = getPercentStatus(memoryUsagePercent, HEALTH_RULES.memory);
    const diskStatus = getPercentStatus(diskUsagePercent, HEALTH_RULES.disk);
    const networkStatus = getNetworkStatus(totalBytesPerSec);

    const topProcesses = processStats.list
      .map((process): ProcessInfo => ({
        pid: process.pid,
        name: process.name || process.command || 'Unknown process',
        cpuPercent: clampPercentage(process.cpu || 0),
        memoryBytes: process.memRss || 0,
        memoryPercent: clampPercentage(process.mem || 0),
        path: process.path || null,
        startedAt: process.started || null,
        user: process.user || null
      }))
      .sort(sortProcesses)
      .slice(0, 10);

    return {
      collectedAt: new Date().toISOString(),
      platform: this.profile.platform,
      cpu: {
        usagePercent: cpuUsagePercent,
        coreCount: os.cpus().length,
        loadAverage: os.loadavg(),
        status: cpuStatus,
        advice: getResourceAdvice('cpu', cpuStatus)
      },
      memory: {
        usagePercent: memoryUsagePercent,
        usedBytes: memoryUsedBytes,
        totalBytes: memoryTotalBytes,
        status: memoryStatus,
        advice: getResourceAdvice('memory', memoryStatus)
      },
      disk: {
        usagePercent: diskUsagePercent,
        usedBytes: diskUsedBytes,
        totalBytes: diskTotalBytes,
        volumes,
        status: diskStatus,
        advice: getResourceAdvice('disk', diskStatus)
      },
      network: {
        receiveBytesPerSec,
        transmitBytesPerSec,
        totalBytesPerSec,
        activeInterfaces: networkStats.filter((stat) => (stat.iface || '').length > 0).length,
        status: networkStatus,
        advice: getResourceAdvice('network', networkStatus)
      },
      topProcesses,
      health: buildSystemHealthSummary({
        cpu: cpuStatus,
        memory: memoryStatus,
        disk: diskStatus,
        network: networkStatus
      })
    };
  }
}
