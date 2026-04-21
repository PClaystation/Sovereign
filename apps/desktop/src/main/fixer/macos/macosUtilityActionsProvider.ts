import { runMacosTextCommand } from '@main/platform/macos/runMacosCommand';
import type { RunUtilityActionRequest } from '@shared/ipc';

export type MacosUtilityAction = Extract<
  RunUtilityActionRequest['action'],
  'flush-dns' | 'restart-finder' | 'empty-trash'
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

    if (action !== 'empty-trash') {
      throw new Error(`Unsupported macOS utility action: ${action}`);
    }

    await runMacosTextCommand('osascript', ['-e', 'tell application "Finder" to empty the trash']);
  }
}
