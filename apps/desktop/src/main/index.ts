import path from 'node:path';

import { app, BrowserWindow } from 'electron';

import { IPC_CHANNELS } from '@shared/ipc';
import { createSystemProbe } from '@main/platform/createSystemProbe';
import { registerIpcHandlers } from '@main/ipc/registerIpc';
import { DashboardService } from '@main/services/dashboardService';
import { JsonEventStore } from '@main/store/jsonEventStore';
import { WatchdogService } from '@main/watchdog/watchdogService';

const WINDOW_CONFIG = {
  width: 1520,
  height: 940,
  minWidth: 1240,
  minHeight: 820
} as const;

let mainWindow: BrowserWindow | null = null;
let dashboardService: DashboardService | null = null;
let watchdogService: WatchdogService | null = null;

const broadcastDashboardUpdate = (channel: string, payload: unknown): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
};

const createMainWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    ...WINDOW_CONFIG,
    backgroundColor: '#09111b',
    titleBarStyle: 'hiddenInset',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
};

const bootstrap = async (): Promise<void> => {
  const eventStore = new JsonEventStore(path.join(app.getPath('userData'), 'events.json'));
  await eventStore.initialize();

  dashboardService = new DashboardService(createSystemProbe(), 5_000);
  await dashboardService.initialize();

  watchdogService = new WatchdogService(eventStore);

  registerIpcHandlers({
    dashboardService,
    eventStore
  });

  dashboardService.subscribe((snapshot) => {
    broadcastDashboardUpdate(IPC_CHANNELS.dashboard.updated, snapshot);
  });

  watchdogService.subscribe((events) => {
    broadcastDashboardUpdate(IPC_CHANNELS.events.updated, events);
  });

  await watchdogService.initialize();

  dashboardService.start();
  watchdogService.start();
  await createMainWindow();
};

app.whenReady().then(() => {
  void bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  dashboardService?.stop();
  watchdogService?.stop();
});
