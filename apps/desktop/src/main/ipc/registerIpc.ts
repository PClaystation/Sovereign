import { ipcMain } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc';
import type { EventsListRequest } from '@shared/ipc';
import type { DashboardService } from '@main/services/dashboardService';
import type { EventStore } from '@main/store/eventStore';

interface RegisterIpcDependencies {
  dashboardService: DashboardService;
  eventStore: EventStore;
}

export const registerIpcHandlers = ({
  dashboardService,
  eventStore
}: RegisterIpcDependencies): void => {
  ipcMain.handle(IPC_CHANNELS.dashboard.getSnapshot, async () =>
    dashboardService.getSnapshot()
  );

  ipcMain.handle(
    IPC_CHANNELS.events.list,
    async (_event, request: EventsListRequest | undefined) =>
      eventStore.list(request)
  );
};
