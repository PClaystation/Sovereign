import type { WatchdogEvent } from '@shared/models';
import type { EventStore } from '@main/store/eventStore';

import { ProcessLaunchMonitor } from './process/processLaunchMonitor';
import { ScheduledTaskMonitor } from './scheduledTasks/scheduledTaskMonitor';
import { SecurityMonitor } from './security/securityMonitor';
import { StartupMonitor } from './startup/startupMonitor';
import type { WatchdogMonitor } from './types';

type WatchdogListener = (events: WatchdogEvent[]) => void;

export class WatchdogService {
  private readonly listeners = new Set<WatchdogListener>();
  private readonly monitors: WatchdogMonitor[];

  constructor(private readonly eventStore: EventStore) {
    const publish = this.publishEvents.bind(this);

    this.monitors = [
      new ProcessLaunchMonitor(publish),
      new StartupMonitor(publish),
      new ScheduledTaskMonitor(publish),
      new SecurityMonitor(publish)
    ];
  }

  async initialize(): Promise<void> {
    for (const monitor of this.monitors) {
      await monitor.initialize();
    }
  }

  start(): void {
    for (const monitor of this.monitors) {
      monitor.start();
    }
  }

  stop(): void {
    for (const monitor of this.monitors) {
      monitor.stop();
    }
  }

  subscribe(listener: WatchdogListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async publishEvents(
    eventsInput: WatchdogEvent | WatchdogEvent[]
  ): Promise<void> {
    const events = Array.isArray(eventsInput) ? eventsInput : [eventsInput];

    if (events.length === 0) {
      return;
    }

    await this.eventStore.append(events);
    this.listeners.forEach((listener) => listener(events));
  }
}
