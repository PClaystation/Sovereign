import type { ServiceSummary } from '@shared/models';
import {
  SERVICE_LAUNCHD_DIRECTORIES,
  listLaunchdDefinitions
} from '@main/platform/macos/launchd';
import { runMacosTextCommand } from '@main/platform/macos/runMacosCommand';

const toStartMode = (
  enabled: boolean,
  automatic: boolean
): ServiceSummary['startMode'] => {
  if (!enabled) {
    return 'disabled';
  }

  return automatic ? 'automatic' : 'manual';
};

export class MacosServicesProvider {
  async list(): Promise<ServiceSummary[]> {
    const definitions = await listLaunchdDefinitions(SERVICE_LAUNCHD_DIRECTORIES);

    return definitions.map((definition) => {
      const startMode = toStartMode(
        definition.enabled,
        definition.runAtLoad || definition.keepAlive
      );
      const canStart = definition.enabled && !definition.running;
      const canStop = definition.loaded || definition.running;
      const canRestart = definition.enabled && (definition.loaded || definition.running);

      return {
        name: definition.label,
        displayName: definition.label,
        state: definition.running ? 'running' : 'stopped',
        startMode,
        canStart,
        canStop,
        canRestart,
        startSupportReason: canStart
          ? null
          : definition.running
            ? 'The launch agent is already running.'
            : startMode === 'disabled'
              ? 'Disabled launch agents cannot be started until they are restored.'
              : 'This launch agent is already loaded and waiting on demand.',
        stopSupportReason: canStop
          ? null
          : 'Only loaded launch agents can be stopped from this panel.',
        restartSupportReason: canRestart
          ? null
          : startMode === 'disabled'
            ? 'Disabled launch agents cannot be restarted until they are restored.'
            : 'Only loaded launch agents can be restarted from this panel.'
      };
    });
  }

  async startService(serviceName: string): Promise<void> {
    const definition = await this.findDefinition(serviceName);

    if (!definition) {
      throw new Error('The selected launch agent no longer exists.');
    }

    if (definition.loaded) {
      await runMacosTextCommand('launchctl', [
        'kickstart',
        '-k',
        `${definition.domainTarget}/${definition.label}`
      ]);
      return;
    }

    await runMacosTextCommand('launchctl', [
      'bootstrap',
      definition.domainTarget,
      definition.plistPath
    ]);
    await runMacosTextCommand(
      'launchctl',
      ['kickstart', '-k', `${definition.domainTarget}/${definition.label}`],
      { allowNonZeroExit: true }
    );
  }

  async stopService(serviceName: string): Promise<void> {
    const definition = await this.findDefinition(serviceName);

    if (!definition) {
      throw new Error('The selected launch agent no longer exists.');
    }

    await runMacosTextCommand('launchctl', [
      'bootout',
      definition.domainTarget,
      definition.plistPath
    ]);
  }

  async restartService(serviceName: string): Promise<void> {
    const definition = await this.findDefinition(serviceName);

    if (!definition) {
      throw new Error('The selected launch agent no longer exists.');
    }

    if (!definition.loaded) {
      await runMacosTextCommand('launchctl', [
        'bootstrap',
        definition.domainTarget,
        definition.plistPath
      ]);
    }

    await runMacosTextCommand('launchctl', [
      'kickstart',
      '-k',
      `${definition.domainTarget}/${definition.label}`
    ]);
  }

  private async findDefinition(serviceName: string) {
    const definitions = await listLaunchdDefinitions(SERVICE_LAUNCHD_DIRECTORIES);
    return definitions.find((definition) => definition.label === serviceName) || null;
  }
}
