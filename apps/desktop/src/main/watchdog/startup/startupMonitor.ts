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
  StartupItemRecord,
  WatchdogMonitorInitializationResult,
  WatchdogMonitor
} from '@main/watchdog/types';
import { buildKey, extractCommandPath } from '@main/watchdog/helpers';

import {
  createStartupItemsProvider,
  getStartupInventorySourceDescription
} from './startupItemsProvider';

const POLL_INTERVAL_MS = 120_000;

const getIdentity = (item: StartupItemRecord): string =>
  buildKey(item.name, item.location, item.user);

const getCommandSignature = (item: StartupItemRecord): string =>
  buildKey(item.command, item.enabled);

export class StartupMonitor implements WatchdogMonitor {
  private readonly provider = createStartupItemsProvider();
  private readonly fileTrustProvider = new FileTrustProvider();
  private knownItems = new Map<string, StartupItemRecord>();
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;
  private pollInFlight: Promise<void> | null = null;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<WatchdogMonitorInitializationResult> {
    if (!this.provider) {
      await this.publish(
        createWatchdogEvent({
          source: 'startup-items',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Startup inventory is unavailable on this platform',
          description:
            'Startup item monitoring currently relies on Windows or macOS startup sources and is unavailable on this platform.',
          rationale:
            'The startup inventory provider currently reads Windows startup entries or macOS LaunchAgents and LaunchDaemons.',
          whyThisMatters:
            'Sovereign surfaces the platform limit explicitly instead of pretending it can read startup items everywhere.',
          evidence: [
            `Current platform is ${process.platform}.`,
            'Startup coverage is currently implemented for Windows and macOS only.'
          ],
          recommendedAction:
            'Run Sovereign on Windows or macOS to capture and compare startup items.'
        })
      );

      return {
        baselineItemCount: 0,
        note: 'Startup monitoring is currently available on Windows and macOS.'
      };
    }

    try {
      const startupItems = await this.provider.list();
      this.knownItems = new Map(
        startupItems.map((item) => [getIdentity(item), item])
      );

      const inventoryEvent = createWatchdogEvent({
        source: 'startup-items',
        category: 'security',
        severity: 'info',
        kind: 'baseline',
        confidence: 'medium',
        title: 'Startup inventory captured',
        description:
          'Sovereign recorded the current startup entries and will compare them for changes over time.',
        rationale:
          'This baseline establishes which visible startup entries were already present when the monitor initialized.',
        whyThisMatters:
          'New or changed startup items are easier to explain when the current baseline is explicit.',
        evidence: [
          `Observed startup items: ${startupItems.length}`,
          `Source: ${getStartupInventorySourceDescription()}`,
          'Some disabled entries may only become visible after they are moved or restored through the app.'
        ],
        recommendedAction:
          'Review unexpected startup entries carefully, especially if they point into user-writable paths.'
      });

      const flaggedItems = (
        await Promise.all(
          startupItems.map((item) =>
            this.createHeuristicEvent(item, 'Current startup item matches a path heuristic')
          )
        )
      )
        .filter((event): event is WatchdogEvent => event !== null);

      await this.publish([inventoryEvent, ...flaggedItems]);

      return {
        baselineItemCount: startupItems.length,
        note: 'Comparing visible startup entries and their commands.'
      };
    } catch (error) {
      await this.publish(
        createWatchdogEvent({
          source: 'startup-items',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Startup inventory could not be read',
          description:
            'Sovereign could not read startup items from the current platform source.',
          rationale:
            'The startup inventory provider failed during baseline capture.',
          whyThisMatters:
            'If startup data is unavailable, later add/change comparisons are limited until the next successful refresh.',
          evidence: [error instanceof Error ? error.message : 'Unknown startup inventory error.'],
          recommendedAction:
            'Some environments restrict or reshape startup data. Compare with the OS startup tools if needed.'
        })
      );

      return {
        baselineItemCount: 0,
        note: 'Startup baseline capture failed. The monitor will retry.'
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
      const startupItems = await this.provider.list();
      const nextItems = new Map(startupItems.map((item) => [getIdentity(item), item]));
      const events: WatchdogEvent[] = [];

      for (const [identity, item] of nextItems.entries()) {
        const previousItem = this.knownItems.get(identity);

        if (!previousItem) {
          events.push(await this.createAddedEvent(item));
          continue;
        }

        if (getCommandSignature(previousItem) !== getCommandSignature(item)) {
          events.push(await this.createChangedEvent(previousItem, item));
        }
      }

      for (const [identity, previousItem] of this.knownItems.entries()) {
        if (!nextItems.has(identity)) {
          events.push(
            createWatchdogEvent({
              source: 'startup-items',
              category: 'security',
              severity: 'info',
              kind: 'change',
              confidence: 'medium',
              title: `Startup item removed: ${previousItem.name}`,
              description:
                'A previously observed startup entry is no longer present in the latest inventory.',
              rationale:
                'The item was present in the baseline or a previous poll and is now absent from the current startup inventory.',
              whyThisMatters:
                'Startup removals are often benign, but they can explain why a previously persistent app stopped launching automatically.',
              evidence: [
                `Location: ${previousItem.location}`,
                `Command: ${previousItem.command || 'Unavailable'}`
              ],
              recommendedAction:
                'Confirm that the removal matches an intentional uninstall or configuration change.',
              subjectName: previousItem.name,
              subjectPath: extractCommandPath(previousItem.command),
              fingerprint: buildKey(
                'startup-item-removed',
                previousItem.name,
                previousItem.location,
                previousItem.command
              )
            })
          );
        }
      }

      this.knownItems = nextItems;

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
          source: 'startup-items',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Startup inventory refresh missed a polling cycle',
          description:
            'Sovereign could not refresh startup items for one interval.',
          rationale:
            'The startup inventory provider failed during the current polling window.',
          whyThisMatters:
            'A missed cycle can hide a startup change until the next successful refresh.',
          evidence: [error instanceof Error ? error.message : 'Unknown startup polling error.'],
          recommendedAction:
            'The monitor will retry automatically. Compare with the OS startup tools if changes are urgent.'
        })
      );
    }
  }

  private async createAddedEvent(item: StartupItemRecord): Promise<WatchdogEvent> {
    const executablePath = extractCommandPath(item.command);
    const pathAssessment = analyzeExecutablePath(executablePath);
    const fileTrust = await this.fileTrustProvider.read(executablePath);

    return createWatchdogEvent({
      source: 'startup-items',
      category: 'security',
      severity: pathAssessment.severity,
      kind: 'change',
      confidence: pathAssessment.confidence,
      title: `Startup item added: ${item.name}`,
      description: 'A new startup entry appeared in the latest startup inventory.',
      rationale: pathAssessment.rationale,
      whyThisMatters:
        'New startup entries change what launches automatically after sign-in and are worth confirming.',
      evidence: [
        `Location: ${item.location}`,
        `Command: ${item.command || 'Unavailable'}`,
        ...(item.user ? [`User: ${item.user}`] : []),
        ...pathAssessment.reasons,
        ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : []),
        ...(fileTrust?.signatureStatus
          ? [`Signature status: ${fileTrust.signatureStatus}`]
          : [])
      ],
      recommendedAction: pathAssessment.recommendedAction,
      subjectName: item.name,
      subjectPath: executablePath,
      pathSignals: pathAssessment.labels,
      fileTrust,
      fingerprint: buildKey('startup-item-added', item.name, item.location, executablePath)
    });
  }

  private async createChangedEvent(
    previousItem: StartupItemRecord,
    nextItem: StartupItemRecord
  ): Promise<WatchdogEvent> {
    const executablePath = extractCommandPath(nextItem.command);
    const pathAssessment = analyzeExecutablePath(executablePath);
    const severity = maxSeverity('unusual', pathAssessment.severity);
    const confidence = maxConfidence('medium', pathAssessment.confidence);
    const fileTrust = await this.fileTrustProvider.read(executablePath);

    return createWatchdogEvent({
      source: 'startup-items',
      category: 'security',
      severity,
      kind: 'change',
      confidence,
      title: `Startup item changed: ${nextItem.name}`,
      description:
        'An existing startup entry changed command or enabled state in the latest startup inventory.',
      rationale:
        pathAssessment.severity === 'info'
          ? 'The startup command changed even though the new path does not currently match a heuristic.'
          : pathAssessment.rationale,
      whyThisMatters:
        'Startup command changes alter what runs automatically and can indicate an installer update, a product repair, or an unexpected persistence change.',
      evidence: [
        `Location: ${nextItem.location}`,
        `Previous command: ${previousItem.command || 'Unavailable'}`,
        `Current command: ${nextItem.command || 'Unavailable'}`,
        ...pathAssessment.reasons,
        ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : [])
      ],
      recommendedAction:
        'Confirm that the startup change was intentional, especially if it now points into a user-writable path.',
      subjectName: nextItem.name,
      subjectPath: executablePath,
      pathSignals: pathAssessment.labels,
      fileTrust,
      fingerprint: buildKey('startup-item-changed', nextItem.name, nextItem.location)
    });
  }

  private async createHeuristicEvent(
    item: StartupItemRecord,
    title: string
  ): Promise<WatchdogEvent | null> {
    const executablePath = extractCommandPath(item.command);
    const pathAssessment = analyzeExecutablePath(executablePath);

    if (pathAssessment.severity === 'info') {
      return null;
    }

    const fileTrust = await this.fileTrustProvider.read(executablePath);

    return createWatchdogEvent({
      source: 'startup-items',
      category: 'security',
      severity: pathAssessment.severity,
      kind: 'baseline',
      confidence: pathAssessment.confidence,
      title: `${title}: ${item.name}`,
      description:
        'An observed startup entry already points into a path that matches one or more explainable heuristics.',
      rationale: pathAssessment.rationale,
      whyThisMatters:
        'Startup entries in user-writable paths are worth validating because they run automatically and can blend in with legitimate software.',
      evidence: [
        `Location: ${item.location}`,
        `Command: ${item.command || 'Unavailable'}`,
        ...pathAssessment.reasons,
        ...(fileTrust?.publisher ? [`Publisher: ${fileTrust.publisher}`] : [])
      ],
      recommendedAction: pathAssessment.recommendedAction,
      subjectName: item.name,
      subjectPath: executablePath,
      pathSignals: pathAssessment.labels,
      fileTrust,
      fingerprint: buildKey('startup-item-baseline', item.name, item.location, executablePath)
    });
  }
}
