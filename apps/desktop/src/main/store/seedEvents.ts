import { randomUUID } from 'node:crypto';

import type { WatchdogEvent, WatchdogSeverity } from '@shared/models';

const createEvent = (
  minutesAgo: number,
  category: WatchdogEvent['category'],
  severity: WatchdogSeverity,
  title: string,
  description: string,
  evidence: string[],
  recommendedAction: string
): WatchdogEvent => ({
  id: randomUUID(),
  timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  source: 'watchdog',
  category,
  severity,
  title,
  description,
  evidence,
  recommendedAction
});

export const createSeedEvents = (): WatchdogEvent[] => [
  createEvent(
    2,
    'application',
    'info',
    'Sovereign dashboard initialized',
    'The desktop control center is online and the local event history store is active.',
    ['Typed Electron IPC bridge connected', 'Local JSON event history is ready'],
    'Use the dashboard to establish a baseline for normal system activity.'
  ),
  createEvent(
    9,
    'system',
    'info',
    'Live telemetry refresh is enabled',
    'CPU, memory, disk, and network summaries are now being sampled in the background.',
    ['Metrics refresh interval: 5 seconds', 'Top processes list is sorted by current pressure'],
    'Leave the app open while you compare normal idle and active periods.'
  ),
  createEvent(
    18,
    'application',
    'info',
    'Watchdog layer is online',
    'Process launch monitoring and safe Windows watchdog providers can now feed the recent events timeline when the platform supports them.',
    [
      'Severity rules stay heuristic and explainable',
      'Windows-only sources degrade gracefully on other platforms'
    ],
    'Use the filters to separate baseline informational events from unusual or suspicious activity.'
  )
];
