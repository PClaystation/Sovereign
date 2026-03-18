import type {
  SystemMetricsSnapshot,
  WatchdogEvent,
  WatchdogEventQuery
} from './models';

export const IPC_CHANNELS = {
  dashboard: {
    getSnapshot: 'dashboard:getSnapshot',
    updated: 'dashboard:updated'
  },
  events: {
    list: 'events:list',
    updated: 'events:updated'
  }
} as const;

export type EventsListRequest = WatchdogEventQuery;

export interface IpcRequestMap {
  [IPC_CHANNELS.dashboard.getSnapshot]: undefined;
  [IPC_CHANNELS.events.list]: EventsListRequest | undefined;
}

export interface IpcResponseMap {
  [IPC_CHANNELS.dashboard.getSnapshot]: SystemMetricsSnapshot;
  [IPC_CHANNELS.events.list]: WatchdogEvent[];
}

export interface IpcEventMap {
  [IPC_CHANNELS.dashboard.updated]: SystemMetricsSnapshot;
  [IPC_CHANNELS.events.updated]: WatchdogEvent[];
}

export interface DesktopApi {
  getDashboardSnapshot(): Promise<SystemMetricsSnapshot>;
  listRecentEvents(query?: WatchdogEventQuery): Promise<WatchdogEvent[]>;
  onDashboardUpdated(listener: (snapshot: SystemMetricsSnapshot) => void): () => void;
  onEventsUpdated(listener: (events: WatchdogEvent[]) => void): () => void;
}
