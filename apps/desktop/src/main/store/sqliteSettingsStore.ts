import { readFile } from 'node:fs/promises';

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type NetworkThresholds,
  type PercentThresholds,
  type WatchdogSuppressionRule
} from '@shared/models';

import type { SettingsStore } from './settingsStore';
import type { SqliteDatabase } from './sqliteDatabase';

const SETTINGS_KEY = 'current';
const MAX_NETWORK_BYTES_PER_SEC = 500 * 1024 * 1024;

interface LegacySettingsStoreFile {
  version: number;
  settings: AppSettings;
}

const cloneSettings = (settings: AppSettings): AppSettings =>
  JSON.parse(JSON.stringify(settings)) as AppSettings;

const clampNumber = (
  candidate: unknown,
  minValue: number,
  maxValue: number,
  fallbackValue: number
): number => {
  if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
    return fallbackValue;
  }

  return Math.min(maxValue, Math.max(minValue, Math.round(candidate)));
};

const normalizePercentThresholds = (
  candidate: Partial<PercentThresholds> | undefined,
  fallback: PercentThresholds
): PercentThresholds => {
  const elevated = clampNumber(candidate?.elevated, 1, 98, fallback.elevated);
  const stressed = clampNumber(candidate?.stressed, elevated + 1, 100, fallback.stressed);

  return {
    elevated,
    stressed: Math.max(stressed, elevated + 1)
  };
};

const normalizeNetworkThresholds = (
  candidate: Partial<NetworkThresholds> | undefined,
  fallback: NetworkThresholds
): NetworkThresholds => {
  const elevatedBytesPerSec = clampNumber(
    candidate?.elevatedBytesPerSec,
    64 * 1024,
    MAX_NETWORK_BYTES_PER_SEC - 1,
    fallback.elevatedBytesPerSec
  );
  const stressedBytesPerSec = clampNumber(
    candidate?.stressedBytesPerSec,
    elevatedBytesPerSec + 1,
    MAX_NETWORK_BYTES_PER_SEC,
    fallback.stressedBytesPerSec
  );

  return {
    elevatedBytesPerSec,
    stressedBytesPerSec: Math.max(stressedBytesPerSec, elevatedBytesPerSec + 1)
  };
};

const normalizeSuppressions = (
  candidate: WatchdogSuppressionRule[] | undefined
): WatchdogSuppressionRule[] =>
  Array.isArray(candidate)
    ? candidate
        .filter((rule) => typeof rule?.id === 'string' && typeof rule?.value === 'string')
        .map((rule): WatchdogSuppressionRule => ({
          id: rule.id.trim(),
          kind: rule.kind === 'path' ? 'path' : 'fingerprint',
          value: rule.value.trim(),
          label: rule.label?.trim() || rule.value.trim(),
          source: rule.source && rule.source !== 'any' ? rule.source : 'any',
          createdAt: rule.createdAt || new Date().toISOString()
        }))
        .filter((rule) => rule.id && rule.value)
    : [];

const normalizeSettings = (candidate: unknown): AppSettings => {
  const parsedSettings = candidate as Partial<AppSettings> | undefined;

  return {
    metricsRefreshIntervalMs: clampNumber(
      parsedSettings?.metricsRefreshIntervalMs,
      1_000,
      60_000,
      DEFAULT_APP_SETTINGS.metricsRefreshIntervalMs
    ),
    timelineEventLimit: clampNumber(
      parsedSettings?.timelineEventLimit,
      5,
      50,
      DEFAULT_APP_SETTINGS.timelineEventLimit
    ),
    theme:
      parsedSettings?.theme === 'light' ||
      parsedSettings?.theme === 'system' ||
      parsedSettings?.theme === 'dark'
        ? parsedSettings.theme
        : DEFAULT_APP_SETTINGS.theme,
    enableTelemetrySummaries:
      typeof parsedSettings?.enableTelemetrySummaries === 'boolean'
        ? parsedSettings.enableTelemetrySummaries
        : DEFAULT_APP_SETTINGS.enableTelemetrySummaries,
    thresholds: {
      cpu: normalizePercentThresholds(
        parsedSettings?.thresholds?.cpu,
        DEFAULT_APP_SETTINGS.thresholds.cpu
      ),
      memory: normalizePercentThresholds(
        parsedSettings?.thresholds?.memory,
        DEFAULT_APP_SETTINGS.thresholds.memory
      ),
      disk: normalizePercentThresholds(
        parsedSettings?.thresholds?.disk,
        DEFAULT_APP_SETTINGS.thresholds.disk
      ),
      network: normalizeNetworkThresholds(
        parsedSettings?.thresholds?.network,
        DEFAULT_APP_SETTINGS.thresholds.network
      )
    },
    monitors: {
      processLaunchMonitoring:
        typeof parsedSettings?.monitors?.processLaunchMonitoring === 'boolean'
          ? parsedSettings.monitors.processLaunchMonitoring
          : DEFAULT_APP_SETTINGS.monitors.processLaunchMonitoring,
      startupMonitoring:
        typeof parsedSettings?.monitors?.startupMonitoring === 'boolean'
          ? parsedSettings.monitors.startupMonitoring
          : DEFAULT_APP_SETTINGS.monitors.startupMonitoring,
      scheduledTaskMonitoring:
        typeof parsedSettings?.monitors?.scheduledTaskMonitoring === 'boolean'
          ? parsedSettings.monitors.scheduledTaskMonitoring
          : DEFAULT_APP_SETTINGS.monitors.scheduledTaskMonitoring,
      securityStatusMonitoring:
        typeof parsedSettings?.monitors?.securityStatusMonitoring === 'boolean'
          ? parsedSettings.monitors.securityStatusMonitoring
          : DEFAULT_APP_SETTINGS.monitors.securityStatusMonitoring
    },
    watchdog: {
      showSuppressedEvents:
        typeof parsedSettings?.watchdog?.showSuppressedEvents === 'boolean'
          ? parsedSettings.watchdog.showSuppressedEvents
          : DEFAULT_APP_SETTINGS.watchdog.showSuppressedEvents,
      suppressions: normalizeSuppressions(parsedSettings?.watchdog?.suppressions)
    }
  };
};

const parseLegacySettings = async (legacyPath?: string): Promise<AppSettings | null> => {
  if (!legacyPath) {
    return null;
  }

  try {
    const rawStore = await readFile(legacyPath, 'utf8');
    const parsedStore = JSON.parse(rawStore) as Partial<LegacySettingsStoreFile>;
    return normalizeSettings(parsedStore.settings);
  } catch {
    return null;
  }
};

export class SqliteSettingsStore implements SettingsStore {
  private currentSettings = cloneSettings(DEFAULT_APP_SETTINGS);

  constructor(
    private readonly database: SqliteDatabase,
    private readonly legacySettingsPath?: string
  ) {}

  async initialize(): Promise<void> {
    await this.database.initialize();
    const storedSettings = await this.database.read((database) => {
      const row = this.database.queryRows(
        database,
        `SELECT value FROM app_settings WHERE key = ? LIMIT 1`,
        [SETTINGS_KEY]
      )[0];

      if (!row) {
        return null;
      }

      return normalizeSettings(row.value ? JSON.parse(String(row.value)) : undefined);
    });

    if (storedSettings) {
      this.currentSettings = storedSettings;
      return;
    }

    const legacySettings = await parseLegacySettings(this.legacySettingsPath);
    this.currentSettings = legacySettings || cloneSettings(DEFAULT_APP_SETTINGS);
    await this.persistSettings(this.currentSettings);
  }

  getSettings(): AppSettings {
    return cloneSettings(this.currentSettings);
  }

  async updateSettings(settings: AppSettings): Promise<AppSettings> {
    this.currentSettings = normalizeSettings(settings);
    await this.persistSettings(this.currentSettings);
    return this.getSettings();
  }

  private async persistSettings(settings: AppSettings): Promise<void> {
    await this.database.write((database) => {
      database.run(
        `INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)`,
        [SETTINGS_KEY, JSON.stringify(settings)]
      );
    });
  }
}
