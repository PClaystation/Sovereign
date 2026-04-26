import type { ScheduledTaskRecord } from '@main/watchdog/types';
import {
  STARTUP_LAUNCHD_DIRECTORIES,
  listLaunchdDefinitions,
  mapLaunchdState,
  type LaunchdDefinition
} from '@main/platform/macos/launchd';

const ensureTrailingSlash = (value: string): string =>
  value.endsWith('/') ? value : `${value}/`;

export const shouldIncludeLaunchdDefinitionAsScheduledTask = (
  definition: Pick<LaunchdDefinition, 'hasSchedule'>
): boolean => definition.hasSchedule;

export const toMacosScheduledTaskRecord = (
  definition: LaunchdDefinition
): ScheduledTaskRecord => ({
  name: definition.label,
  path: ensureTrailingSlash(definition.location),
  enabled: definition.enabled,
  lastRunAt: null,
  nextRunAt: null,
  command: definition.command || null,
  state: [mapLaunchdState(definition), definition.scheduleSummary].filter(Boolean).join(' · ')
});

export class MacosScheduledTaskProvider {
  async list(): Promise<ScheduledTaskRecord[]> {
    const definitions = await listLaunchdDefinitions(STARTUP_LAUNCHD_DIRECTORIES);

    return definitions
      .filter(shouldIncludeLaunchdDefinitionAsScheduledTask)
      .map(toMacosScheduledTaskRecord);
  }
}
