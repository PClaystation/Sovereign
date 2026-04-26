import os from 'node:os';
import path from 'node:path';
import { readdir } from 'node:fs/promises';

import { runMacosTextCommand } from './runMacosCommand';

export interface LaunchdDirectoryDescriptor {
  directory: string;
  location: string;
  user: string | null;
  domainTarget: string;
  controllable: boolean;
  kind: 'launch-agent' | 'launch-daemon';
}

export interface LaunchdDefinition {
  label: string;
  plistPath: string;
  location: string;
  user: string | null;
  domainTarget: string;
  command: string;
  enabled: boolean;
  loaded: boolean;
  running: boolean;
  runAtLoad: boolean;
  keepAlive: boolean;
  hasSchedule: boolean;
  scheduleSummary: string | null;
  kind: LaunchdDirectoryDescriptor['kind'];
}

interface RawLaunchdPlist {
  Label?: string;
  Program?: string;
  ProgramArguments?: string[];
  RunAtLoad?: boolean;
  KeepAlive?: boolean | Record<string, unknown>;
  StartInterval?: number;
  StartCalendarInterval?: unknown;
  WatchPaths?: string[];
  QueueDirectories?: string[];
  StartOnMount?: boolean;
  Disabled?: boolean;
}

interface LaunchctlListEntry {
  pid: number | null;
}

const DEFAULT_USER = os.userInfo().username || null;
const USER_ID = typeof process.getuid === 'function' ? process.getuid() : null;

export const USER_LAUNCH_AGENTS_DIRECTORY = path.join(
  os.homedir(),
  'Library',
  'LaunchAgents'
);

export const STARTUP_LAUNCHD_DIRECTORIES: LaunchdDirectoryDescriptor[] = [
  {
    directory: USER_LAUNCH_AGENTS_DIRECTORY,
    location: '~/Library/LaunchAgents',
    user: DEFAULT_USER,
    domainTarget: USER_ID == null ? 'gui' : `gui/${USER_ID}`,
    controllable: true,
    kind: 'launch-agent'
  },
  {
    directory: '/Library/LaunchAgents',
    location: '/Library/LaunchAgents',
    user: 'All users',
    domainTarget: USER_ID == null ? 'gui' : `gui/${USER_ID}`,
    controllable: false,
    kind: 'launch-agent'
  },
  {
    directory: '/Library/LaunchDaemons',
    location: '/Library/LaunchDaemons',
    user: 'System',
    domainTarget: 'system',
    controllable: false,
    kind: 'launch-daemon'
  }
];

export const SERVICE_LAUNCHD_DIRECTORIES: LaunchdDirectoryDescriptor[] = [
  STARTUP_LAUNCHD_DIRECTORIES[0]
];

const parseBooleanState = (value: string): boolean | null => {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.includes('enabled') ||
    normalizedValue.includes('on') ||
    normalizedValue.includes('yes')
  ) {
    return true;
  }

  if (
    normalizedValue.includes('disabled') ||
    normalizedValue.includes('off') ||
    normalizedValue.includes('no')
  ) {
    return false;
  }

  return null;
};

const buildCommand = (rawPlist: RawLaunchdPlist): string => {
  if (Array.isArray(rawPlist.ProgramArguments) && rawPlist.ProgramArguments.length > 0) {
    return rawPlist.ProgramArguments.join(' ');
  }

  if (typeof rawPlist.Program === 'string' && rawPlist.Program.trim()) {
    return rawPlist.Program.trim();
  }

  return '';
};

const buildScheduleSummary = (rawPlist: RawLaunchdPlist): string | null => {
  const scheduleParts: string[] = [];

  if (typeof rawPlist.StartInterval === 'number' && rawPlist.StartInterval > 0) {
    scheduleParts.push(`interval:${rawPlist.StartInterval}s`);
  }

  if (rawPlist.StartCalendarInterval != null) {
    scheduleParts.push(`calendar:${JSON.stringify(rawPlist.StartCalendarInterval)}`);
  }

  if (Array.isArray(rawPlist.WatchPaths) && rawPlist.WatchPaths.length > 0) {
    scheduleParts.push(`watch:${rawPlist.WatchPaths.join(',')}`);
  }

  if (Array.isArray(rawPlist.QueueDirectories) && rawPlist.QueueDirectories.length > 0) {
    scheduleParts.push(`queue:${rawPlist.QueueDirectories.join(',')}`);
  }

  if (rawPlist.StartOnMount === true) {
    scheduleParts.push('mount');
  }

  return scheduleParts.length > 0 ? scheduleParts.join(' | ') : null;
};

const readDisabledMap = async (domainTarget: string): Promise<Map<string, boolean>> => {
  const output = await runMacosTextCommand('launchctl', ['print-disabled', domainTarget], {
    allowNonZeroExit: true
  });
  const disabledMap = new Map<string, boolean>();
  const entryPattern = /^\s*"([^"]+)"\s*=>\s*(enabled|disabled)\s*$/gim;
  let match = entryPattern.exec(output);

  while (match) {
    disabledMap.set(match[1], match[2].toLowerCase() === 'disabled');
    match = entryPattern.exec(output);
  }

  return disabledMap;
};

const readLaunchctlListMap = async (): Promise<Map<string, LaunchctlListEntry>> => {
  const output = await runMacosTextCommand('launchctl', ['list'], {
    allowNonZeroExit: true
  });
  const entries = new Map<string, LaunchctlListEntry>();

  for (const line of output.split('\n').slice(1)) {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
      continue;
    }

    const match = trimmedLine.match(/^(\S+)\s+(\S+)\s+(.+)$/);

    if (!match) {
      continue;
    }

    entries.set(match[3], {
      pid: /^\d+$/.test(match[1]) ? Number(match[1]) : null
    });
  }

  return entries;
};

const readPlistDefinition = async (
  plistPath: string
): Promise<RawLaunchdPlist | null> => {
  const output = await runMacosTextCommand('plutil', ['-convert', 'json', '-o', '-', plistPath], {
    allowNonZeroExit: true
  });

  if (!output) {
    return null;
  }

  try {
    return JSON.parse(output) as RawLaunchdPlist;
  } catch {
    return null;
  }
};

export const listLaunchdDefinitions = async (
  directories: LaunchdDirectoryDescriptor[]
): Promise<LaunchdDefinition[]> => {
  const uniqueDomains = [...new Set(directories.map((descriptor) => descriptor.domainTarget))];
  const disabledMaps = new Map<string, Map<string, boolean>>();
  const currentUserEntries = new Set(
    directories
      .filter((descriptor) => descriptor.domainTarget.startsWith('gui/'))
      .map((descriptor) => descriptor.domainTarget)
  );

  for (const domainTarget of uniqueDomains) {
    disabledMaps.set(domainTarget, await readDisabledMap(domainTarget));
  }

  const loadedEntries = await readLaunchctlListMap();
  const definitions: LaunchdDefinition[] = [];

  for (const descriptor of directories) {
    let dirents;

    try {
      dirents = await readdir(descriptor.directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const dirent of dirents) {
      if (!dirent.isFile() || path.extname(dirent.name).toLowerCase() !== '.plist') {
        continue;
      }

      const plistPath = path.join(descriptor.directory, dirent.name);
      const rawPlist = await readPlistDefinition(plistPath);
      const label = rawPlist?.Label?.trim() || path.basename(dirent.name, '.plist');
      const disabledValue = disabledMaps.get(descriptor.domainTarget)?.get(label);
      const loadedEntry =
        currentUserEntries.has(descriptor.domainTarget) ? loadedEntries.get(label) : undefined;

      definitions.push({
        label,
        plistPath,
        location: descriptor.location,
        user: descriptor.user,
        domainTarget: descriptor.domainTarget,
        command: buildCommand(rawPlist || {}),
        enabled:
          disabledValue == null
            ? rawPlist?.Disabled === true
              ? false
              : true
            : !disabledValue,
        loaded: Boolean(loadedEntry),
        running: Boolean(loadedEntry?.pid && loadedEntry.pid > 0),
        runAtLoad: rawPlist?.RunAtLoad === true,
        keepAlive:
          rawPlist?.KeepAlive === true ||
          (typeof rawPlist?.KeepAlive === 'object' && rawPlist.KeepAlive !== null),
        hasSchedule:
          typeof rawPlist?.StartInterval === 'number' ||
          rawPlist?.StartCalendarInterval != null ||
          (Array.isArray(rawPlist?.WatchPaths) && rawPlist.WatchPaths.length > 0) ||
          (Array.isArray(rawPlist?.QueueDirectories) &&
            rawPlist.QueueDirectories.length > 0) ||
          rawPlist?.StartOnMount === true,
        scheduleSummary: rawPlist ? buildScheduleSummary(rawPlist) : null,
        kind: descriptor.kind
      });
    }
  }

  return definitions.sort((left, right) => left.label.localeCompare(right.label));
};

export const mapLaunchdState = (
  definition: Pick<LaunchdDefinition, 'loaded' | 'running'>
): 'running' | 'stopped' => (definition.running || definition.loaded ? 'running' : 'stopped');

export const isMacosFirewallEnabled = (value: string): boolean | null =>
  parseBooleanState(value);
