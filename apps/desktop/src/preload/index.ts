import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IPC_CHANNELS, type DesktopApi } from '@shared/ipc';
import type {
  SystemMetricsSnapshot,
  WatchdogEvent,
  WatchdogEventQuery
} from '@shared/models';

const api: DesktopApi = {
  getDashboardSnapshot: () =>
    ipcRenderer.invoke(IPC_CHANNELS.dashboard.getSnapshot) as Promise<SystemMetricsSnapshot>,
  listRecentEvents: (query?: WatchdogEventQuery) =>
    ipcRenderer.invoke(IPC_CHANNELS.events.list, query) as Promise<WatchdogEvent[]>,
  onDashboardUpdated: (listener) => {
    const subscription = (
      _event: IpcRendererEvent,
      snapshot: SystemMetricsSnapshot
    ): void => {
      listener(snapshot);
    };

    ipcRenderer.on(IPC_CHANNELS.dashboard.updated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.dashboard.updated, subscription);
    };
  },
  onEventsUpdated: (listener) => {
    const subscription = (
      _event: IpcRendererEvent,
      events: WatchdogEvent[]
    ): void => {
      listener(events);
    };

    ipcRenderer.on(IPC_CHANNELS.events.updated, subscription);

    return () => {
      ipcRenderer.off(IPC_CHANNELS.events.updated, subscription);
    };
  }
};

contextBridge.exposeInMainWorld('sovereign', api);
