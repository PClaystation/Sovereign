import path from 'node:path';
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile
} from 'node:fs/promises';

import type { StartupBackupSummary } from '@shared/models';
import {
  STARTUP_LAUNCHD_DIRECTORIES,
  USER_LAUNCH_AGENTS_DIRECTORY,
  listLaunchdDefinitions
} from '@main/platform/macos/launchd';
import { runMacosTextCommand } from '@main/platform/macos/runMacosCommand';
import type { StartupItemRecord } from '@main/watchdog/types';
import { buildKey } from '@main/watchdog/helpers';

interface StartupBackupRecord {
  id: string;
  startupItemId?: string;
  name: string;
  command: string;
  location: string;
  sourceType: 'folder';
  filePath: string | null;
  backupPath: string | null;
  domainTarget: string;
  disabledAt: string;
}

const STARTUP_BACKUP_FILE = 'startup-macos-backups.json';

const safeFileName = (candidate: string): string =>
  candidate.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'launch-agent';

const fileExists = async (candidatePath: string | null): Promise<boolean> => {
  if (!candidatePath) {
    return false;
  }

  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

const readBackupManifest = async (
  backupsDirectory: string
): Promise<StartupBackupRecord[]> => {
  const manifestPath = path.join(backupsDirectory, STARTUP_BACKUP_FILE);

  try {
    const rawManifest = await readFile(manifestPath, 'utf8');
    const parsedManifest = JSON.parse(rawManifest) as StartupBackupRecord[];
    return Array.isArray(parsedManifest) ? parsedManifest : [];
  } catch {
    return [];
  }
};

const writeBackupManifest = async (
  backupsDirectory: string,
  backups: StartupBackupRecord[]
): Promise<void> => {
  await mkdir(backupsDirectory, { recursive: true });
  await writeFile(
    path.join(backupsDirectory, STARTUP_BACKUP_FILE),
    JSON.stringify(backups, null, 2),
    'utf8'
  );
};

const moveFile = async (sourcePath: string, destinationPath: string): Promise<void> => {
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    const errorCode = (error as NodeJS.ErrnoException).code;

    if (errorCode !== 'EXDEV') {
      throw error;
    }

    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
};

export class MacosStartupItemsProvider {
  async list(): Promise<StartupItemRecord[]> {
    const definitions = await listLaunchdDefinitions(STARTUP_LAUNCHD_DIRECTORIES);

    return definitions.map((definition) => {
      const canDisable =
        definition.plistPath.startsWith(`${USER_LAUNCH_AGENTS_DIRECTORY}${path.sep}`) &&
        definition.enabled;

      return {
        id: buildKey('launchd', definition.plistPath, definition.label),
        name: definition.label,
        command: definition.command,
        location:
          definition.kind === 'launch-daemon'
            ? `${definition.location} (LaunchDaemon)`
            : `${definition.location} (LaunchAgent)`,
        enabled: definition.enabled,
        publisher: null,
        user: definition.user,
        canDisable,
        actionSupportReason: canDisable
          ? null
          : definition.plistPath.startsWith(`${USER_LAUNCH_AGENTS_DIRECTORY}${path.sep}`)
            ? 'This launch agent is already disabled or not currently actionable.'
            : 'Only user LaunchAgents are directly controllable from the macOS profile.',
        sourceType: 'folder',
        registryHive: null,
        registryPath: null,
        valueName: null,
        filePath: definition.plistPath
      };
    });
  }

  async disable(item: StartupItemRecord, backupsDirectory: string): Promise<void> {
    if (!item.filePath) {
      throw new Error('LaunchAgent metadata is incomplete.');
    }

    if (!item.filePath.startsWith(`${USER_LAUNCH_AGENTS_DIRECTORY}${path.sep}`)) {
      throw new Error('Only user LaunchAgents can be disabled from this macOS profile.');
    }

    const disabledDirectory = path.join(backupsDirectory, 'disabled-launch-agents');
    await mkdir(disabledDirectory, { recursive: true });

    const backupPath = path.join(
      disabledDirectory,
      `${safeFileName(item.name)}-${Date.now()}${path.extname(item.filePath)}`
    );

    await runMacosTextCommand(
      'launchctl',
      ['bootout', STARTUP_LAUNCHD_DIRECTORIES[0].domainTarget, item.filePath],
      { allowNonZeroExit: true }
    );
    await moveFile(item.filePath, backupPath);

    const backups = await readBackupManifest(backupsDirectory);
    backups.push({
      id: buildKey(item.id, Date.now()),
      startupItemId: item.id,
      name: item.name,
      command: item.command,
      location: item.location,
      sourceType: 'folder',
      filePath: item.filePath,
      backupPath,
      domainTarget: STARTUP_LAUNCHD_DIRECTORIES[0].domainTarget,
      disabledAt: new Date().toISOString()
    });
    await writeBackupManifest(backupsDirectory, backups);
  }

  async listBackups(backupsDirectory: string): Promise<StartupBackupSummary[]> {
    const backups = await readBackupManifest(backupsDirectory);

    return Promise.all(
      backups
        .slice()
        .sort((left, right) => Date.parse(right.disabledAt) - Date.parse(left.disabledAt))
        .map(async (backup) => ({
          id: backup.id,
          startupItemId: backup.startupItemId || backup.id,
          name: backup.name,
          command: backup.command,
          location: backup.location,
          sourceType: backup.sourceType,
          disabledAt: backup.disabledAt,
          backupPath: backup.backupPath,
          canRestore: Boolean(
            backup.filePath && backup.backupPath && (await fileExists(backup.backupPath))
          ),
          restoreSupportReason:
            backup.filePath && backup.backupPath && (await fileExists(backup.backupPath))
              ? null
              : 'The saved LaunchAgent backup file is no longer available.'
        }))
    );
  }

  async restore(
    backupId: string,
    backupsDirectory: string
  ): Promise<StartupBackupSummary> {
    const backups = await readBackupManifest(backupsDirectory);
    const backup = backups.find((candidate) => candidate.id === backupId);

    if (!backup) {
      throw new Error('The saved LaunchAgent backup no longer exists.');
    }

    if (!backup.filePath || !backup.backupPath) {
      throw new Error('LaunchAgent backup metadata is incomplete.');
    }

    if (!(await fileExists(backup.backupPath))) {
      throw new Error('The saved LaunchAgent backup file is no longer available.');
    }

    await mkdir(path.dirname(backup.filePath), { recursive: true });
    await moveFile(backup.backupPath, backup.filePath);
    await runMacosTextCommand(
      'launchctl',
      ['bootstrap', backup.domainTarget, backup.filePath],
      { allowNonZeroExit: true }
    );

    await writeBackupManifest(
      backupsDirectory,
      backups.filter((candidate) => candidate.id !== backupId)
    );

    return {
      id: backup.id,
      startupItemId: backup.startupItemId || backup.id,
      name: backup.name,
      command: backup.command,
      location: backup.location,
      sourceType: backup.sourceType,
      disabledAt: backup.disabledAt,
      backupPath: backup.backupPath,
      canRestore: true,
      restoreSupportReason: null
    };
  }
}
