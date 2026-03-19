import type {
  AppSettings,
  WatchdogEvent,
  WatchdogMonitorId,
  WatchdogMonitorRuntime
} from '@shared/models';
import type { EventStore } from '@main/store/eventStore';

import { ProcessLaunchMonitor } from './process/processLaunchMonitor';
import { ScheduledTaskMonitor } from './scheduledTasks/scheduledTaskMonitor';
import { SecurityMonitor } from './security/securityMonitor';
import { StartupMonitor } from './startup/startupMonitor';
import type { WatchdogMonitor } from './types';

type WatchdogListener = (events: WatchdogEvent[]) => void;
type WatchdogStatusListener = (statuses: WatchdogMonitorRuntime[]) => void;

interface MonitorRegistration {
  id: WatchdogMonitorId;
  title: string;
  description: string;
  pollingIntervalMs: number;
  windowsOnly?: boolean;
  monitor: WatchdogMonitor;
}

const MONITOR_METADATA: Array<
  Omit<MonitorRegistration, 'monitor'>
> = [
  {
    id: 'processLaunchMonitoring',
    title: 'Process launches',
    description: 'Detect newly observed processes by comparing the live user-space process table.',
    pollingIntervalMs: 10_000
  },
  {
    id: 'startupMonitoring',
    title: 'Startup items',
    description: 'Compare visible Windows startup entries and highlight suspicious paths or changes.',
    pollingIntervalMs: 120_000,
    windowsOnly: true
  },
  {
    id: 'scheduledTaskMonitoring',
    title: 'Scheduled tasks',
    description: 'Read readable scheduled task summaries and surface new or changed tasks.',
    pollingIntervalMs: 180_000,
    windowsOnly: true
  },
  {
    id: 'securityStatusMonitoring',
    title: 'Defender and firewall',
    description: 'Re-check Microsoft Defender and Windows Firewall status through safe command surfaces.',
    pollingIntervalMs: 90_000,
    windowsOnly: true
  }
];

export class WatchdogService {
  private readonly listeners = new Set<WatchdogListener>();
  private readonly statusListeners = new Set<WatchdogStatusListener>();
  private readonly monitors: MonitorRegistration[];
  private readonly initializedMonitorIds = new Set<WatchdogMonitorId>();
  private readonly monitorStatusMap = new Map<WatchdogMonitorId, WatchdogMonitorRuntime>();
  private isRunning = false;

  constructor(
    private readonly eventStore: EventStore,
    private currentSettings: AppSettings
  ) {
    this.monitors = [
      {
        ...MONITOR_METADATA[0],
        monitor: new ProcessLaunchMonitor((events) =>
          this.publishEvents('processLaunchMonitoring', events)
        )
      },
      {
        ...MONITOR_METADATA[1],
        monitor: new StartupMonitor((events) => this.publishEvents('startupMonitoring', events))
      },
      {
        ...MONITOR_METADATA[2],
        monitor: new ScheduledTaskMonitor((events) =>
          this.publishEvents('scheduledTaskMonitoring', events)
        )
      },
      {
        ...MONITOR_METADATA[3],
        monitor: new SecurityMonitor((events) =>
          this.publishEvents('securityStatusMonitoring', events)
        )
      }
    ];

    for (const registration of this.monitors) {
      this.monitorStatusMap.set(registration.id, this.createMonitorStatus(registration));
    }
  }

  async initialize(): Promise<void> {
    await this.syncMonitors();
  }

  start(): void {
    this.isRunning = true;
    void this.syncMonitors();
  }

  async refreshNow(): Promise<void> {
    await this.syncMonitors();

    for (const registration of this.monitors) {
      const isEnabled = this.currentSettings.monitors[registration.id];
      const supported = this.isMonitorSupported(registration);

      if (!isEnabled || !supported) {
        continue;
      }

      try {
        await registration.monitor.refreshNow();
        this.updateMonitorStatus(registration.id, {
          enabled: true,
          supported: true,
          state: this.isRunning ? 'active' : 'idle',
          lastCheckedAt: new Date().toISOString(),
          lastError: null
        });
      } catch (error) {
        this.reportMonitorError(registration, error);
      }
    }
  }

  stop(): void {
    this.isRunning = false;

    for (const registration of this.monitors) {
      registration.monitor.stop();

      this.updateMonitorStatus(registration.id, {
        enabled: this.currentSettings.monitors[registration.id],
        supported: this.isMonitorSupported(registration),
        state: this.isMonitorSupported(registration) ? 'idle' : 'unsupported'
      });
    }
  }

  async updateSettings(settings: AppSettings): Promise<void> {
    this.currentSettings = settings;
    await this.syncMonitors();
  }

  getMonitorStatuses(): WatchdogMonitorRuntime[] {
    return this.monitors.map((registration) => ({
      ...(this.monitorStatusMap.get(registration.id) as WatchdogMonitorRuntime)
    }));
  }

  subscribe(listener: WatchdogListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  subscribeStatuses(listener: WatchdogStatusListener): () => void {
    this.statusListeners.add(listener);

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private async publishEvents(
    monitorId: WatchdogMonitorId,
    eventsInput: WatchdogEvent | WatchdogEvent[]
  ): Promise<void> {
    const events = Array.isArray(eventsInput) ? eventsInput : [eventsInput];

    if (events.length === 0) {
      return;
    }

    await this.eventStore.append(events);

    const newestTimestamp = [...events]
      .map((event) => event.timestamp)
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0];

    const currentStatus = this.monitorStatusMap.get(monitorId) as WatchdogMonitorRuntime;
    this.updateMonitorStatus(monitorId, {
      lastEventAt: newestTimestamp || currentStatus.lastEventAt,
      eventCount: currentStatus.eventCount + events.length,
      lastError: null,
      state: currentStatus.supported ? (this.isRunning ? 'active' : 'idle') : 'unsupported'
    });

    this.listeners.forEach((listener) => listener(events));
  }

  private async syncMonitors(): Promise<void> {
    for (const registration of this.monitors) {
      const enabled = this.currentSettings.monitors[registration.id];
      const supported = this.isMonitorSupported(registration);

      this.updateMonitorStatus(registration.id, {
        enabled,
        supported,
        state: supported ? (enabled && this.isRunning ? 'active' : 'idle') : 'unsupported'
      });

      if (!enabled) {
        registration.monitor.stop();
        this.initializedMonitorIds.delete(registration.id);
        this.updateMonitorStatus(registration.id, {
          lastError: null
        });
        continue;
      }

      if (!this.initializedMonitorIds.has(registration.id)) {
        try {
          await registration.monitor.initialize();
          this.initializedMonitorIds.add(registration.id);
          this.updateMonitorStatus(registration.id, {
            lastCheckedAt: new Date().toISOString(),
            lastError: null,
            state: supported ? (this.isRunning ? 'active' : 'idle') : 'unsupported'
          });
        } catch (error) {
          this.reportMonitorError(registration, error);
          continue;
        }
      }

      if (!supported) {
        registration.monitor.stop();
        continue;
      }

      if (this.isRunning) {
        registration.monitor.start();
        this.updateMonitorStatus(registration.id, {
          state: 'active'
        });
      }
    }
  }

  private isMonitorSupported(registration: MonitorRegistration): boolean {
    return !registration.windowsOnly || process.platform === 'win32';
  }

  private createMonitorStatus(registration: MonitorRegistration): WatchdogMonitorRuntime {
    const enabled = this.currentSettings.monitors[registration.id];
    const supported = this.isMonitorSupported(registration);

    return {
      id: registration.id,
      title: registration.title,
      description: registration.description,
      enabled,
      supported,
      state: supported ? (enabled && this.isRunning ? 'active' : 'idle') : 'unsupported',
      lastCheckedAt: null,
      lastEventAt: null,
      lastError: null,
      eventCount: 0,
      pollingIntervalMs: registration.pollingIntervalMs
    };
  }

  private updateMonitorStatus(
    monitorId: WatchdogMonitorId,
    patch: Partial<WatchdogMonitorRuntime>
  ): void {
    const currentStatus = this.monitorStatusMap.get(monitorId);

    if (!currentStatus) {
      return;
    }

    this.monitorStatusMap.set(monitorId, {
      ...currentStatus,
      ...patch
    });
    this.emitStatusUpdate();
  }

  private emitStatusUpdate(): void {
    const statuses = this.getMonitorStatuses();
    this.statusListeners.forEach((listener) => listener(statuses));
  }

  private reportMonitorError(
    registration: MonitorRegistration,
    error: unknown
  ): void {
    this.updateMonitorStatus(registration.id, {
      enabled: this.currentSettings.monitors[registration.id],
      supported: this.isMonitorSupported(registration),
      state: this.isMonitorSupported(registration) ? 'degraded' : 'unsupported',
      lastCheckedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : 'Unknown watchdog error.'
    });
  }
}
