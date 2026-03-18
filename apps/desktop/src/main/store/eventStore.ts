import type { WatchdogEvent, WatchdogEventQuery } from '@shared/models';

export interface EventStore {
  initialize(): Promise<void>;
  list(query?: WatchdogEventQuery): Promise<WatchdogEvent[]>;
  append(events: WatchdogEvent | WatchdogEvent[]): Promise<void>;
}
