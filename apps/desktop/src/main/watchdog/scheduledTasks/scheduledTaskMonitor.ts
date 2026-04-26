import type { WatchdogEvent } from '@shared/models';
import { createWatchdogEvent } from '@main/watchdog/eventFactory';
import { FileTrustProvider } from '@main/watchdog/fileTrustProvider';
import {
  analyzeExecutablePath,
  maxConfidence,
  maxSeverity
} from '@main/watchdog/rules';
import type {
  EventPublisher,
  ScheduledTaskRecord,
  WatchdogMonitorInitializationResult,
  WatchdogMonitor
} from '@main/watchdog/types';
import { buildKey } from '@main/watchdog/helpers';

import {
  createScheduledTaskProvider,
  getScheduledTaskInventorySourceDescription,
  getScheduledTaskPlatformLabel
} from './scheduledTaskProvider';

const POLL_INTERVAL_MS = 180_000;

const getIdentity = (task: ScheduledTaskRecord): string =>
  buildKey(task.path, task.name);

const getTaskSignature = (task: ScheduledTaskRecord): string =>
  buildKey(task.command, task.enabled, task.state, task.nextRunAt);

const getScheduledTaskNoun = (): string =>
  process.platform === 'darwin' ? 'scheduled launch job' : 'scheduled task';

export class ScheduledTaskMonitor implements WatchdogMonitor {
  private readonly provider = createScheduledTaskProvider();
  private readonly fileTrustProvider = new FileTrustProvider();
  private knownTasks = new Map<string, ScheduledTaskRecord>();
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;
  private pollInFlight: Promise<void> | null = null;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<WatchdogMonitorInitializationResult> {
    if (!this.provider) {
      await this.publish(
        createWatchdogEvent({
          source: 'scheduled-tasks',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Scheduled task inventory is unavailable on this platform',
          description:
            'Scheduled execution summaries currently rely on Windows or macOS platform sources and are unavailable on this platform.',
          rationale:
            'The scheduled task provider currently supports Windows Task Scheduler and readable macOS launchd schedule metadata.',
          whyThisMatters:
            'Sovereign surfaces this platform limit directly instead of pretending scheduled task coverage exists everywhere.',
          evidence: [
            `Current platform is ${process.platform}.`,
            'Scheduled execution metadata is only collected when the local OS exposes a readable command or plist surface.'
          ],
          recommendedAction:
            'Run Sovereign on Windows or macOS to inventory and compare scheduled execution entries.'
        })
      );

      return {
        baselineItemCount: 0,
        note: 'Scheduled execution monitoring is currently available on Windows and macOS.'
      };
    }

    try {
      const tasks = await this.provider.list();
      this.knownTasks = new Map(tasks.map((task) => [getIdentity(task), task]));

      const inventoryEvent = createWatchdogEvent({
        source: 'scheduled-tasks',
        category: 'security',
        severity: 'info',
        kind: 'baseline',
        confidence: 'medium',
        title: 'Scheduled task inventory captured',
        description:
          'Sovereign recorded visible scheduled task summaries and will compare them for changes over time.',
        rationale:
          'This baseline establishes which readable scheduled tasks were already present when the monitor initialized.',
        whyThisMatters:
          'New or changed tasks are easier to judge when there is an explicit baseline of what was already there.',
        evidence: [
          `Observed tasks: ${tasks.length}`,
          `Source: ${getScheduledTaskInventorySourceDescription()}`,
          process.platform === 'darwin'
            ? 'macOS does not expose next-run and last-run timestamps for these launchd definitions through this safe user-space path.'
            : 'Some task details can still be limited by Windows permissions.'
        ],
        recommendedAction:
          'Review newly added or changed tasks carefully if they point into user-writable paths.'
      });

      const flaggedTasks = (
        await Promise.all(
          tasks.map((task) =>
            this.createHeuristicEvent(task, 'Current scheduled task matches a path heuristic')
          )
        )
      )
        .filter((event): event is WatchdogEvent => event !== null);

      await this.publish([inventoryEvent, ...flaggedTasks]);

      return {
        baselineItemCount: tasks.length,
        note:
          process.platform === 'darwin'
            ? 'Comparing readable launchd schedules, commands, and runtime state.'
            : 'Comparing readable scheduled task commands and states.'
      };
    } catch (error) {
      await this.publish(
        createWatchdogEvent({
          source: 'scheduled-tasks',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Scheduled task inventory could not be read',
          description:
            process.platform === 'darwin'
              ? 'Sovereign could not read scheduled launch job summaries from the current macOS source.'
              : 'Sovereign could not read scheduled task summaries from the current Windows source.',
          rationale:
            'The scheduled task inventory command failed during baseline capture.',
          whyThisMatters:
            'If task data is unavailable, later add/change comparisons are limited until the next successful refresh.',
          evidence: [
            error instanceof Error ? error.message : 'Unknown scheduled task inventory error.'
          ],
          recommendedAction:
            process.platform === 'darwin'
              ? 'Some environments restrict launchd inspection. Compare with `launchctl` if needed.'
              : 'Some environments restrict scheduled task inspection. Compare with Task Scheduler if needed.'
        })
      );

      return {
        baselineItemCount: 0,
        note: 'Scheduled task baseline capture failed. The monitor will retry.'
      };
    }
  }

  start(): void {
    if (!this.provider || this.pollTimer) {
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
    if (!this.provider) {
      return;
    }

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
    if (!this.provider) {
      return;
    }

    try {
      const tasks = await this.provider.list();
      const nextTasks = new Map(tasks.map((task) => [getIdentity(task), task]));
      const events: WatchdogEvent[] = [];

      for (const [identity, task] of nextTasks.entries()) {
        const previousTask = this.knownTasks.get(identity);

        if (!previousTask) {
          events.push(await this.createAddedEvent(task));
          continue;
        }

        if (getTaskSignature(previousTask) !== getTaskSignature(task)) {
          events.push(await this.createChangedEvent(previousTask, task));
        }
      }

      for (const [identity, previousTask] of this.knownTasks.entries()) {
        if (!nextTasks.has(identity)) {
          events.push(
            createWatchdogEvent({
              source: 'scheduled-tasks',
              category: 'security',
              severity: 'info',
              kind: 'change',
              confidence: 'medium',
              title: `Scheduled task removed: ${previousTask.path}${previousTask.name}`,
              description:
                'A previously observed scheduled task is no longer present in the latest inventory.',
              rationale:
                'The task was present in the baseline or a previous poll and is now absent from the current scheduled task inventory.',
              whyThisMatters:
                `${getScheduledTaskPlatformLabel()} removals are often benign, but they can explain why a previously recurring item stopped running.`,
              evidence: [
                `Task path: ${previousTask.path}`,
                `Command: ${previousTask.command || 'Unavailable'}`
              ],
              recommendedAction:
                'Confirm that the removal matches an intentional cleanup or software uninstall.',
              subjectName: previousTask.name,
              subjectPath: previousTask.command || null,
              fingerprint: buildKey(
                'scheduled-task-removed',
                previousTask.path,
                previousTask.name
              )
            })
          );
        }
      }

      this.knownTasks = nextTasks;

      if (events.length > 0) {
        await this.publish(events);
      }

      this.reportedFailure = false;
    } catch (error) {
      if (this.reportedFailure) {
        return;
      }

      this.reportedFailure = true;

      await this.publish(
        createWatchdogEvent({
          source: 'scheduled-tasks',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Scheduled task inventory refresh missed a polling cycle',
          description:
            process.platform === 'darwin'
              ? 'Sovereign could not refresh scheduled launch job summaries for one interval.'
              : 'Sovereign could not refresh scheduled task summaries for one interval.',
          rationale:
            'The scheduled task provider failed during the current polling window.',
          whyThisMatters:
            'A missed cycle can hide a scheduled task change until the next successful refresh.',
          evidence: [
            error instanceof Error ? error.message : 'Unknown scheduled task polling error.'
          ],
          recommendedAction:
            process.platform === 'darwin'
              ? 'The monitor will retry automatically. Compare with `launchctl` if you need immediate confirmation.'
              : 'The monitor will retry automatically. Compare with Task Scheduler if you need immediate confirmation.'
        })
      );
    }
  }

  private async createAddedEvent(task: ScheduledTaskRecord): Promise<WatchdogEvent> {
    const pathAssessment = analyzeExecutablePath(task.command);
    const fileTrust = await this.fileTrustProvider.read(task.command);

    return createWatchdogEvent({
      source: 'scheduled-tasks',
      category: 'security',
      severity: pathAssessment.severity,
      kind: 'change',
      confidence: pathAssessment.confidence,
      title: `Scheduled task added: ${task.path}${task.name}`,
      description: `A new ${getScheduledTaskNoun()} appeared in the latest inventory.`,
      rationale: pathAssessment.rationale,
      whyThisMatters:
        `New ${getScheduledTaskPlatformLabel()} can represent legitimate software maintenance, but they can also be used for persistence or recurring execution.`,
      evidence: [
        `Task path: ${task.path}`,
        `Command: ${task.command || 'Unavailable'}`,
        `Enabled: ${task.enabled ? 'yes' : 'no'}`,
        ...(task.nextRunAt ? [`Next run: ${task.nextRunAt}`] : []),
        ...pathAssessment.reasons,
        ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : [])
      ],
      recommendedAction: pathAssessment.recommendedAction,
      subjectName: task.name,
      subjectPath: task.command,
      pathSignals: pathAssessment.labels,
      fileTrust,
      fingerprint: buildKey('scheduled-task-added', task.path, task.name)
    });
  }

  private async createChangedEvent(
    previousTask: ScheduledTaskRecord,
    nextTask: ScheduledTaskRecord
  ): Promise<WatchdogEvent> {
    const pathAssessment = analyzeExecutablePath(nextTask.command);
    const severity = maxSeverity('unusual', pathAssessment.severity);
    const confidence = maxConfidence('medium', pathAssessment.confidence);
    const fileTrust = await this.fileTrustProvider.read(nextTask.command);

    return createWatchdogEvent({
      source: 'scheduled-tasks',
      category: 'security',
      severity,
      kind: 'change',
      confidence,
      title: `Scheduled task changed: ${nextTask.path}${nextTask.name}`,
      description:
        `An existing ${getScheduledTaskNoun()} changed command or state in the latest inventory.`,
      rationale:
        pathAssessment.severity === 'info'
          ? 'The task configuration changed even though the new command path does not currently match a heuristic.'
          : pathAssessment.rationale,
      whyThisMatters:
        'Scheduled task changes alter what runs later and can reflect a legitimate update or an unexpected persistence change.',
      evidence: [
        `Task path: ${nextTask.path}`,
        `Previous command: ${previousTask.command || 'Unavailable'}`,
        `Current command: ${nextTask.command || 'Unavailable'}`,
        `Current state: ${nextTask.state || 'Unknown'}`,
        ...pathAssessment.reasons,
        ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : [])
      ],
      recommendedAction:
        'Confirm that the task change was intentional, especially if it now points into a user-writable path.',
      subjectName: nextTask.name,
      subjectPath: nextTask.command,
      pathSignals: pathAssessment.labels,
      fileTrust,
      fingerprint: buildKey('scheduled-task-changed', nextTask.path, nextTask.name)
    });
  }

  private async createHeuristicEvent(
    task: ScheduledTaskRecord,
    title: string
  ): Promise<WatchdogEvent | null> {
    const pathAssessment = analyzeExecutablePath(task.command);

    if (pathAssessment.severity === 'info') {
      return null;
    }

    const fileTrust = await this.fileTrustProvider.read(task.command);

    return createWatchdogEvent({
      source: 'scheduled-tasks',
      category: 'security',
      severity: pathAssessment.severity,
      kind: 'baseline',
      confidence: pathAssessment.confidence,
      title: `${title}: ${task.path}${task.name}`,
      description:
        `An observed ${getScheduledTaskNoun()} already points into a path that matches one or more explainable heuristics.`,
      rationale: pathAssessment.rationale,
      whyThisMatters:
        `${getScheduledTaskPlatformLabel()} that point into user-writable paths are worth validating because they can re-run later without user attention.`,
      evidence: [
        `Command: ${task.command || 'Unavailable'}`,
        `Task path: ${task.path}`,
        ...pathAssessment.reasons,
        ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : [])
      ],
      recommendedAction: pathAssessment.recommendedAction,
      subjectName: task.name,
      subjectPath: task.command,
      pathSignals: pathAssessment.labels,
      fileTrust,
      fingerprint: buildKey('scheduled-task-baseline', task.path, task.name)
    });
  }
}
