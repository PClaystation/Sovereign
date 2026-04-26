import {
  escapePowerShellString,
  runPowerShellText
} from '@main/watchdog/windows/runPowerShell';
import type { RunUtilityActionRequest } from '@shared/ipc';

export type WindowsUtilityAction = Extract<
  RunUtilityActionRequest['action'],
  | 'flush-dns'
  | 'open-task-manager'
  | 'open-windows-security'
  | 'restart-explorer'
  | 'empty-recycle-bin'
>;

export class WindowsUtilityActionsProvider {
  async run(action: RunUtilityActionRequest['action']): Promise<void> {
    if (action === 'flush-dns') {
      await runPowerShellText('Clear-DnsClientCache -ErrorAction Stop');
      return;
    }

    if (action === 'restart-explorer') {
      await runPowerShellText(
        '$explorer = Get-Process explorer -ErrorAction SilentlyContinue; if ($explorer) { Stop-Process -Name explorer -Force -ErrorAction Stop }; Start-Process explorer.exe'
      );
      return;
    }

    if (action === 'open-task-manager') {
      await this.openTarget('taskmgr.exe');
      return;
    }

    if (action === 'open-windows-security') {
      await this.openTarget('windowsdefender:');
      return;
    }

    if (action !== 'empty-recycle-bin') {
      throw new Error(`Unsupported Windows utility action: ${action}`);
    }

    await runPowerShellText('Clear-RecycleBin -Force -ErrorAction Stop');
  }

  private async openTarget(target: string): Promise<void> {
    await runPowerShellText(
      `Start-Process ${escapePowerShellString(target)} -ErrorAction Stop`
    );
  }
}
