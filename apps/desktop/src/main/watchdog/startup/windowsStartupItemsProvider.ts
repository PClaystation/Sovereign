import type { StartupItemRecord } from '@main/watchdog/types';

import { runPowerShellJson } from '../windows/runPowerShell';

interface RawStartupItem {
  Name?: string;
  Command?: string;
  Location?: string;
  User?: string;
}

const STARTUP_ITEMS_COMMAND = `
$items = Get-CimInstance Win32_StartupCommand |
  Sort-Object Location, Name |
  ForEach-Object {
    [PSCustomObject]@{
      Name = $_.Name
      Command = $_.Command
      Location = $_.Location
      User = $_.User
    }
  }
$items | ConvertTo-Json -Depth 3 -Compress
`;

export class WindowsStartupItemsProvider {
  async list(): Promise<StartupItemRecord[]> {
    const rawItems = await runPowerShellJson<RawStartupItem>(STARTUP_ITEMS_COMMAND);

    return rawItems.map((item) => ({
      name: item.Name?.trim() || 'Unnamed startup item',
      command: item.Command?.trim() || '',
      location: item.Location?.trim() || 'Unknown location',
      enabled: true,
      publisher: null,
      user: item.User?.trim() || null
    }));
  }
}
