import type { ScheduledTaskRecord } from '@main/watchdog/types';
import { normalizeTimestamp } from '@main/watchdog/helpers';

import { runPowerShellJson } from '../windows/runPowerShell';

interface RawScheduledTask {
  Name?: string;
  Path?: string;
  Enabled?: boolean;
  State?: string;
  LastRunTime?: string;
  NextRunTime?: string;
  Command?: string;
}

const SCHEDULED_TASKS_COMMAND = `
$tasks = Get-ScheduledTask |
  Sort-Object TaskPath, TaskName |
  ForEach-Object {
    $taskInfo = $null
    try {
      $taskInfo = $_ | Get-ScheduledTaskInfo
    } catch {
      $taskInfo = $null
    }

    $firstAction = $null
    if ($_.Actions -and $_.Actions.Count -gt 0) {
      $firstAction = $_.Actions[0].Execute
    }

    [PSCustomObject]@{
      Name = $_.TaskName
      Path = $_.TaskPath
      Enabled = $_.Settings.Enabled
      State = $_.State.ToString()
      LastRunTime = if ($taskInfo) { $taskInfo.LastRunTime } else { $null }
      NextRunTime = if ($taskInfo) { $taskInfo.NextRunTime } else { $null }
      Command = $firstAction
    }
  }
$tasks | ConvertTo-Json -Depth 4 -Compress
`;

export class WindowsScheduledTaskProvider {
  async list(): Promise<ScheduledTaskRecord[]> {
    const rawTasks = await runPowerShellJson<RawScheduledTask>(SCHEDULED_TASKS_COMMAND);

    return rawTasks.map((task) => ({
      name: task.Name?.trim() || 'Unnamed task',
      path: task.Path?.trim() || '\\',
      enabled: Boolean(task.Enabled),
      lastRunAt: normalizeTimestamp(task.LastRunTime),
      nextRunAt: normalizeTimestamp(task.NextRunTime),
      command: task.Command?.trim() || null,
      state: task.State?.trim() || null
    }));
  }
}
