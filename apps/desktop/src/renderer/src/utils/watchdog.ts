import type { WatchdogCategory, WatchdogSourceId } from '@shared/models';

export const WATCHDOG_CATEGORY_LABELS: Record<WatchdogCategory, string> = {
  application: 'Application',
  system: 'System',
  process: 'Process',
  network: 'Network',
  storage: 'Storage',
  security: 'Security'
};

export const WATCHDOG_SOURCE_LABELS: Record<WatchdogSourceId, string> = {
  watchdog: 'Watchdog',
  'process-launch': 'Process launches',
  'startup-items': 'Startup items',
  'scheduled-tasks': 'Scheduled tasks',
  'defender-status': 'Defender status',
  'firewall-status': 'Firewall status'
};
