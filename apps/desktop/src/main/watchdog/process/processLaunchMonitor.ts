import si from 'systeminformation';

import type { WatchdogEvent } from '@shared/models';
import { createWatchdogEvent } from '@main/watchdog/eventFactory';
import { FileTrustProvider } from '@main/watchdog/fileTrustProvider';
import { analyzeExecutablePath } from '@main/watchdog/rules';
import type {
  EventPublisher,
  WatchdogMonitorInitializationResult,
  ProcessSnapshot,
  WatchdogMonitor
} from '@main/watchdog/types';
import { buildKey, extractCommandPath } from '@main/watchdog/helpers';

const POLL_INTERVAL_MS = 10_000;
const MAX_DETAILED_INFO_EVENTS = 3;

const toProcessSnapshot = (
  process: si.Systeminformation.ProcessesProcessData
): ProcessSnapshot => ({
  key: buildKey(process.pid, process.started, process.path || process.command || process.name),
  pid: process.pid,
  parentPid: typeof process.parentPid === 'number' ? process.parentPid : null,
  name: process.name || process.command || 'Unknown process',
  path: process.path || null,
  command: process.command || null,
  user: process.user || null,
  startedAt: process.started || null
});

export class ProcessLaunchMonitor implements WatchdogMonitor {
  private readonly fileTrustProvider = new FileTrustProvider();
  private knownProcesses = new Map<string, ProcessSnapshot>();
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;
  private pollInFlight: Promise<void> | null = null;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<WatchdogMonitorInitializationResult> {
    try {
      const baselineProcesses = await this.captureProcesses();
      this.knownProcesses = new Map(
        baselineProcesses.map((process) => [process.key, process])
      );

      await this.publish(
        createWatchdogEvent({
          source: 'process-launch',
          category: 'process',
          severity: 'info',
          title: 'Process launch baseline captured',
          kind: 'baseline',
          confidence: 'medium',
          description:
            'Sovereign captured the current process inventory and will compare future samples against that baseline.',
          rationale:
            'New launches are detected by comparing the live user-space process table over time.',
          whyThisMatters:
            'A baseline makes later process launches easier to explain without pretending that every new process is suspicious.',
          evidence: [
            `Baseline captured for ${baselineProcesses.length} running processes.`,
            `Polling interval: ${Math.round(POLL_INTERVAL_MS / 1000)} seconds.`,
            'Launches from temp, Downloads, and AppData paths are elevated by explainable heuristics.'
          ],
          recommendedAction:
            'Use later unusual or suspicious launch events to focus the investigation.'
        })
      );

      return {
        baselineItemCount: baselineProcesses.length,
        note: 'Comparing the live process table every 10 seconds.'
      };
    } catch (error) {
      await this.publish(
        createWatchdogEvent({
          source: 'process-launch',
          category: 'process',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Process launch monitoring is limited',
          description:
            'Sovereign could not capture the initial process baseline from the current user-space inventory.',
          rationale:
            'The baseline process snapshot failed, so later launch comparisons may be incomplete until a refresh succeeds.',
          whyThisMatters:
            'Without a baseline, the monitor can still retry, but the first few launch comparisons may be less useful.',
          evidence: [error instanceof Error ? error.message : 'Unknown process inventory error.'],
          recommendedAction:
            'The monitor will keep retrying in the background while the app remains open.'
        })
      );

      return {
        baselineItemCount: 0,
        note: 'Baseline capture failed. The monitor will retry on the next refresh.'
      };
    }
  }

  start(): void {
    if (this.pollTimer) {
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.runPoll();
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    if (!this.pollTimer) {
      return;
    }

    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  async refreshNow(): Promise<void> {
    await this.runPoll();
  }

  private async runPoll(): Promise<void> {
    if (!this.pollInFlight) {
      this.pollInFlight = this.poll().finally(() => {
        this.pollInFlight = null;
      });
    }

    await this.pollInFlight;
  }

  private async poll(): Promise<void> {
    try {
      const currentProcesses = await this.captureProcesses();
      const currentProcessMap = new Map(
        currentProcesses.map((process) => [process.key, process])
      );
      const newProcesses = currentProcesses.filter(
        (process) => !this.knownProcesses.has(process.key)
      );

      this.knownProcesses = currentProcessMap;

      if (newProcesses.length === 0) {
        return;
      }

      await this.publish(await this.buildLaunchEvents(newProcesses));
      this.reportedFailure = false;
    } catch (error) {
      if (this.reportedFailure) {
        return;
      }

      this.reportedFailure = true;

      await this.publish(
        createWatchdogEvent({
          source: 'process-launch',
          category: 'process',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Process launch monitor missed a polling cycle',
          description:
            'Sovereign could not refresh the process list for one interval.',
          rationale:
            'The process inventory command failed during this polling window.',
          whyThisMatters:
            'A missed cycle reduces visibility into short-lived processes that started and exited during the gap.',
          evidence: [error instanceof Error ? error.message : 'Unknown process polling error.'],
          recommendedAction:
            'If the issue persists, restart the app and compare with standard OS process tools.'
        })
      );
    }
  }

  private async captureProcesses(): Promise<ProcessSnapshot[]> {
    const processInventory = await si.processes();
    return processInventory.list
      .filter((process) => process.pid > 0)
      .map(toProcessSnapshot);
  }

  private async buildLaunchEvents(processes: ProcessSnapshot[]): Promise<WatchdogEvent[]> {
    const detailedEvents: WatchdogEvent[] = [];
    const informationalProcesses: ProcessSnapshot[] = [];
    const pathsForTrustLookup = processes
      .map((process) => process.path || extractCommandPath(process.command))
      .filter((value): value is string => Boolean(value?.trim()));
    const trustByPath = await this.fileTrustProvider.readMany(pathsForTrustLookup);

    for (const process of processes) {
      const executablePath = process.path || extractCommandPath(process.command);
      const pathAssessment = analyzeExecutablePath(executablePath);
      const fileTrust = executablePath
        ? trustByPath.get(executablePath.replace(/\\/g, '/').toLowerCase()) || null
        : null;

      if (pathAssessment.severity === 'info') {
        informationalProcesses.push(process);
        continue;
      }

      detailedEvents.push(
        createWatchdogEvent({
          source: 'process-launch',
          category: 'process',
          severity: pathAssessment.severity,
          kind: 'incident',
          confidence: pathAssessment.confidence,
          title:
            pathAssessment.labels.length > 0
              ? `${process.name} launched from ${pathAssessment.labels[0]}`
              : `Process launched: ${process.name}`,
          description:
            'A newly observed process launch matched one or more explainable path heuristics.',
          rationale: pathAssessment.rationale,
          whyThisMatters: pathAssessment.whyThisMatters,
          evidence: [
            `PID: ${process.pid}`,
            ...(process.parentPid ? [`Parent PID: ${process.parentPid}`] : []),
            `Path: ${executablePath || 'Path unavailable'}`,
            ...(process.command ? [`Command line: ${process.command}`] : []),
            ...(process.user ? [`User: ${process.user}`] : []),
            ...pathAssessment.reasons,
            ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : []),
            ...(fileTrust?.signatureStatus
              ? [`Signature status: ${fileTrust.signatureStatus}`]
              : [])
          ],
          recommendedAction: pathAssessment.recommendedAction,
          subjectName: process.name,
          subjectPath: executablePath,
          pathSignals: pathAssessment.labels,
          fileTrust,
          fingerprint: buildKey(
            'process-launch',
            process.name,
            executablePath,
            pathAssessment.matchedRules.join('|')
          )
        })
      );
    }

    if (informationalProcesses.length <= MAX_DETAILED_INFO_EVENTS) {
      for (const process of informationalProcesses) {
        const executablePath = process.path || extractCommandPath(process.command);
        const fileTrust = executablePath
          ? trustByPath.get(executablePath.replace(/\\/g, '/').toLowerCase()) || null
          : null;
        detailedEvents.push(
          createWatchdogEvent({
            source: 'process-launch',
            category: 'process',
            severity: 'info',
            kind: 'change',
            confidence: 'low',
            title: `Process launched: ${process.name}`,
            description:
              'A new process appeared in the user-space inventory and did not match the current path heuristics.',
            rationale:
              'The process is new relative to Sovereign’s recent baseline, but its path does not currently match a user-writable heuristic.',
            whyThisMatters:
              'New processes are normal on a desktop system. This is baseline context unless the process name, timing, or parent looks wrong.',
            evidence: [
              `PID: ${process.pid}`,
              `Path: ${
                process.path || extractCommandPath(process.command) || 'Path unavailable'
              }`,
              ...(process.command ? [`Command line: ${process.command}`] : []),
              ...(process.user ? [`User: ${process.user}`] : []),
              'Path did not match the current temp, Downloads, or AppData heuristics.',
              ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : [])
            ],
            recommendedAction:
              'Treat this as baseline activity unless the process name or timing still looks wrong.',
            subjectName: process.name,
            subjectPath: executablePath,
            fileTrust,
            fingerprint: buildKey('process-launch', process.name, executablePath, 'baseline')
          })
        );
      }

      return detailedEvents;
    }

    detailedEvents.push(
      createWatchdogEvent({
        source: 'process-launch',
        category: 'process',
        severity: 'info',
        kind: 'summary',
        confidence: 'medium',
        title: 'Multiple new processes observed',
        description:
          'Several new launches were detected during the last polling interval and none matched the current path heuristics.',
        rationale:
          'The launch volume changed, but the observed paths did not currently stand out on their own.',
        whyThisMatters:
          'Bursts of normal launches are common around logon, updates, and app startups. This is mainly meant to preserve context without flooding the timeline.',
        evidence: [
          `Launch count: ${informationalProcesses.length}`,
          `Examples: ${informationalProcesses
            .slice(0, 5)
            .map((process) => process.name)
            .join(', ')}`
        ],
        recommendedAction:
          'Use the filters to focus on unusual or suspicious activity first, then inspect the process table for more detail.',
        relatedEventCount: informationalProcesses.length,
        fingerprint: buildKey('process-launch-summary', 'multiple-new-processes')
      })
    );

    return detailedEvents;
  }
}
