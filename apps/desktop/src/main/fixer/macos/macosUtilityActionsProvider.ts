import { runMacosTextCommand } from '@main/platform/macos/runMacosCommand';
import type { RunUtilityActionRequest } from '@shared/ipc';

export type MacosUtilityAction = Extract<
  RunUtilityActionRequest['action'],
  'flush-dns' | 'open-activity-monitor' | 'open-system-settings' | 'restart-finder' | 'empty-trash'
>;

export class MacosUtilityActionsProvider {
  async run(action: RunUtilityActionRequest['action']): Promise<void> {
    if (action === 'flush-dns') {
      await runMacosTextCommand('dscacheutil', ['-flushcache']);
      await runMacosTextCommand('killall', ['-HUP', 'mDNSResponder']);
      return;
    }

    if (action === 'restart-finder') {
      await runMacosTextCommand('osascript', ['-e', 'tell application "Finder" to quit']);
      await runMacosTextCommand('open', ['-a', 'Finder']);
      return;
    }

    if (action === 'open-activity-monitor') {
      await runMacosTextCommand('open', ['-a', 'Activity Monitor']);
      return;
    }

    if (action === 'open-system-settings') {
      await runMacosTextCommand('open', ['-a', 'System Settings']);
      return;
    }

    if (action !== 'empty-trash') {
      throw new Error(`Unsupported macOS utility action: ${action}`);
    }

    await runMacosTextCommand('osascript', ['-e', 'tell application "Finder" to empty the trash']);
  }
}
