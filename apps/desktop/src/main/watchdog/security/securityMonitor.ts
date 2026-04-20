import type { WatchdogEvent } from '@shared/models';
import { createWatchdogEvent } from '@main/watchdog/eventFactory';
import type {
  DefenderStatusSnapshot,
  EventPublisher,
  FirewallProfileSnapshot,
  SecurityStatusSnapshot,
  WatchdogMonitorInitializationResult,
  WatchdogMonitor
} from '@main/watchdog/types';

import { WindowsSecurityStatusProvider } from './windowsSecurityStatusProvider';

const POLL_INTERVAL_MS = 90_000;

const getDefenderSignature = (status: DefenderStatusSnapshot | null): string =>
  JSON.stringify(status);

const getFirewallSignature = (profiles: FirewallProfileSnapshot[]): string =>
  JSON.stringify(
    profiles.map((profile) => ({
      name: profile.name,
      enabled: profile.enabled,
      defaultInboundAction: profile.defaultInboundAction,
      defaultOutboundAction: profile.defaultOutboundAction,
      error: profile.error
    }))
  );

const createDefenderEvent = (
  defenderStatus: DefenderStatusSnapshot | null,
  hasPreviousSnapshot: boolean
): WatchdogEvent => {
  if (!defenderStatus || !defenderStatus.available) {
    return createWatchdogEvent({
      source: 'defender-status',
      category: 'security',
      severity: 'info',
      kind: 'status',
      confidence: 'low',
      title: hasPreviousSnapshot
        ? 'Defender status is no longer readable'
        : 'Defender status could not be read',
      description:
        'Sovereign could not confirm Microsoft Defender status from the current Windows command surface.',
      rationale:
        'The Defender status command was unavailable or returned incomplete data.',
      whyThisMatters:
        'Unreadable status does not prove the device is unprotected, but it does reduce certainty about the current posture.',
      evidence: [
        defenderStatus?.error || 'The Defender PowerShell cmdlet was unavailable.',
        'This does not prove that the device is unprotected.'
      ],
      recommendedAction:
        'Compare with Windows Security or other endpoint protection tools before drawing conclusions.',
      fingerprint: 'defender-status-readable'
    });
  }

  const disabledCoreProtections =
    defenderStatus.antivirusEnabled === false ||
    defenderStatus.realTimeProtectionEnabled === false;
  const disabledSecondaryProtections =
    defenderStatus.behaviorMonitorEnabled === false ||
    defenderStatus.ioavProtectionEnabled === false ||
    defenderStatus.antispywareEnabled === false ||
    defenderStatus.serviceEnabled === false;

  if (disabledCoreProtections) {
    return createWatchdogEvent({
      source: 'defender-status',
      category: 'security',
      severity: 'suspicious',
      kind: hasPreviousSnapshot ? 'change' : 'status',
      confidence: 'high',
      title: hasPreviousSnapshot
        ? 'Defender protection changed'
        : 'Defender protection appears reduced',
      description: 'One or more core Defender protections are reported as disabled.',
      rationale:
        'Core Defender protections, such as antivirus or real-time protection, reported a disabled state.',
      whyThisMatters:
        'Reduced core protection materially changes the local security posture, even if another product is intended to take over.',
      evidence: [
        `Antivirus enabled: ${defenderStatus.antivirusEnabled ? 'yes' : 'no'}`,
        `Real-time protection: ${
          defenderStatus.realTimeProtectionEnabled ? 'yes' : 'no'
        }`,
        `Service enabled: ${defenderStatus.serviceEnabled ? 'yes' : 'no'}`
      ],
      recommendedAction:
        'Confirm whether this reduction was intentional or whether another security product replaced these protections.',
      fingerprint: 'defender-core-protection'
    });
  }

  if (disabledSecondaryProtections) {
    return createWatchdogEvent({
      source: 'defender-status',
      category: 'security',
      severity: 'unusual',
      kind: hasPreviousSnapshot ? 'change' : 'status',
      confidence: 'medium',
      title: hasPreviousSnapshot ? 'Defender status changed' : 'Defender status shows partial coverage',
      description:
        'Microsoft Defender is readable, but one or more secondary protections are reported as disabled.',
      rationale:
        'Defender reported a partial protection state rather than full coverage.',
      whyThisMatters:
        'Partial coverage may be intentional, but it is still a meaningful posture change worth confirming.',
      evidence: [
        `Behavior monitoring: ${
          defenderStatus.behaviorMonitorEnabled ? 'yes' : 'no'
        }`,
        `IOAV protection: ${defenderStatus.ioavProtectionEnabled ? 'yes' : 'no'}`,
        `Antispyware: ${defenderStatus.antispywareEnabled ? 'yes' : 'no'}`
      ],
      recommendedAction:
        'Review the current Windows Security configuration and confirm whether these settings are expected.',
      fingerprint: 'defender-partial-coverage'
    });
  }

  return createWatchdogEvent({
    source: 'defender-status',
    category: 'security',
    severity: 'info',
    kind: hasPreviousSnapshot ? 'change' : 'status',
    confidence: 'medium',
    title: hasPreviousSnapshot ? 'Defender status refreshed' : 'Defender status looks healthy',
    description:
      'Microsoft Defender reported its core protections as enabled at the last check.',
    rationale:
      'The current Defender snapshot reported its core protections as enabled.',
    whyThisMatters:
      'Healthy status events provide useful posture context, but they are not a guarantee about every security control on the device.',
    evidence: [
      `Antivirus enabled: ${defenderStatus.antivirusEnabled ? 'yes' : 'no'}`,
      `Real-time protection: ${
        defenderStatus.realTimeProtectionEnabled ? 'yes' : 'no'
      }`,
      `Behavior monitoring: ${
        defenderStatus.behaviorMonitorEnabled ? 'yes' : 'no'
      }`
    ],
    recommendedAction:
      'Treat this as a current status snapshot rather than a guarantee about every security control on the device.',
    fingerprint: 'defender-healthy'
  });
};

const createFirewallEvent = (
  firewallProfiles: FirewallProfileSnapshot[],
  hasPreviousSnapshot: boolean
): WatchdogEvent => {
  if (firewallProfiles.length === 0 || firewallProfiles.every((profile) => profile.error)) {
    return createWatchdogEvent({
      source: 'firewall-status',
      category: 'security',
      severity: 'info',
      kind: 'status',
      confidence: 'low',
      title: hasPreviousSnapshot
        ? 'Firewall status is no longer readable'
        : 'Firewall status could not be read',
      description:
        'Sovereign could not confirm Windows Firewall profile states from the current Windows command surface.',
      rationale:
        'The firewall profile command was unavailable or returned incomplete data.',
      whyThisMatters:
        'Unreadable firewall state does not prove it is disabled, but it reduces certainty about the current network posture.',
      evidence: [
        firewallProfiles[0]?.error || 'The firewall PowerShell cmdlet was unavailable.',
        'This does not prove that the firewall is disabled.'
      ],
      recommendedAction:
        'Compare with Windows Defender Firewall settings before drawing conclusions.',
      fingerprint: 'firewall-status-readable'
    });
  }

  const disabledProfiles = firewallProfiles.filter((profile) => profile.enabled === false);

  if (disabledProfiles.length === firewallProfiles.length && firewallProfiles.length > 0) {
    return createWatchdogEvent({
      source: 'firewall-status',
      category: 'security',
      severity: 'suspicious',
      kind: hasPreviousSnapshot ? 'change' : 'status',
      confidence: 'high',
      title: hasPreviousSnapshot ? 'Firewall profile state changed' : 'Firewall appears broadly disabled',
      description: 'All readable firewall profiles are currently reported as disabled.',
      rationale:
        'Every readable firewall profile reported a disabled state.',
      whyThisMatters:
        'A broadly disabled firewall materially changes the machine’s network exposure.',
      evidence: disabledProfiles.map(
        (profile) =>
          `${profile.name}: disabled (inbound ${profile.defaultInboundAction || 'unknown'}, outbound ${profile.defaultOutboundAction || 'unknown'})`
      ),
      recommendedAction:
        'Confirm whether this is intentional. A fully disabled firewall is uncommon on a managed Windows desktop.',
      fingerprint: 'firewall-disabled'
    });
  }

  if (disabledProfiles.length > 0) {
    return createWatchdogEvent({
      source: 'firewall-status',
      category: 'security',
      severity: 'unusual',
      kind: hasPreviousSnapshot ? 'change' : 'status',
      confidence: 'medium',
      title: hasPreviousSnapshot ? 'Firewall profile state changed' : 'One or more firewall profiles are disabled',
      description:
        'At least one readable firewall profile is currently reported as disabled.',
      rationale:
        'One or more firewall profiles reported a disabled state while other readable profiles remained enabled.',
      whyThisMatters:
        'Mixed firewall states can be intentional, but they still change the effective network posture and should be confirmed.',
      evidence: firewallProfiles.map(
        (profile) =>
          `${profile.name}: ${
            profile.enabled ? 'enabled' : 'disabled'
          } (inbound ${profile.defaultInboundAction || 'unknown'}, outbound ${
            profile.defaultOutboundAction || 'unknown'
          })`
      ),
      recommendedAction:
        'Review the firewall profile configuration and confirm whether the disabled profile is expected.',
      fingerprint: 'firewall-partial-disabled'
    });
  }

  return createWatchdogEvent({
    source: 'firewall-status',
    category: 'security',
    severity: 'info',
    kind: hasPreviousSnapshot ? 'change' : 'status',
    confidence: 'medium',
    title: hasPreviousSnapshot ? 'Firewall status refreshed' : 'Firewall profiles look enabled',
    description:
      'Readable Windows Firewall profiles were reported as enabled at the last check.',
    rationale:
      'The current firewall snapshot reported enabled states for the readable profiles.',
    whyThisMatters:
      'Healthy status events provide posture context, but they are still only a snapshot of the currently readable firewall profiles.',
    evidence: firewallProfiles.map(
      (profile) =>
        `${profile.name}: enabled (inbound ${profile.defaultInboundAction || 'unknown'}, outbound ${
          profile.defaultOutboundAction || 'unknown'
        })`
    ),
    recommendedAction:
      'Treat this as a current status snapshot and re-check if the network posture changes later.',
    fingerprint: 'firewall-healthy'
  });
};

export class SecurityMonitor implements WatchdogMonitor {
  private readonly provider = new WindowsSecurityStatusProvider();
  private currentSnapshot: SecurityStatusSnapshot | null = null;
  private pollTimer: NodeJS.Timeout | undefined;
  private reportedFailure = false;
  private pollInFlight: Promise<void> | null = null;

  constructor(private readonly publish: EventPublisher) {}

  async initialize(): Promise<WatchdogMonitorInitializationResult> {
    if (process.platform !== 'win32') {
      await this.publish([
        createWatchdogEvent({
          source: 'defender-status',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Defender status is Windows-only',
          description:
            'Microsoft Defender status reads currently rely on Windows-specific PowerShell cmdlets and are unavailable on this platform.',
          rationale:
            'The Defender status provider uses Windows-specific PowerShell cmdlets.',
          whyThisMatters:
            'Sovereign surfaces this platform limit directly instead of implying unsupported coverage.',
          evidence: ['Current platform is not Windows.'],
          recommendedAction:
            'Run Sovereign on Windows 11 to read Defender status from the local system.'
        }),
        createWatchdogEvent({
          source: 'firewall-status',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Firewall status is Windows-only',
          description:
            'Windows Firewall profile reads currently rely on Windows-specific PowerShell cmdlets and are unavailable on this platform.',
          rationale:
            'The firewall status provider uses Windows-specific PowerShell cmdlets.',
          whyThisMatters:
            'Sovereign surfaces this platform limit directly instead of implying unsupported coverage.',
          evidence: ['Current platform is not Windows.'],
          recommendedAction: 'Run Sovereign on Windows 11 to read local firewall profile status.'
        })
      ]);

      return {
        baselineItemCount: 0,
        note: 'Defender and firewall status reads are only available on Windows.'
      };
    }

    try {
      this.currentSnapshot = await this.provider.read();
      await this.publish(this.createEvents(this.currentSnapshot, false));

      return {
        baselineItemCount: this.currentSnapshot.firewallProfiles.length + (this.currentSnapshot.defender ? 1 : 0),
        note: 'Re-checking Defender and firewall status on an interval.'
      };
    } catch (error) {
      await this.publish(
        createWatchdogEvent({
          source: 'defender-status',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Security status could not be read',
          description:
            'Sovereign could not read Defender or firewall status from the current Windows sources.',
          rationale:
            'The Windows security status provider failed during initialization.',
          whyThisMatters:
            'If the security snapshot is unavailable, posture guidance is limited until the next successful refresh.',
          evidence: [error instanceof Error ? error.message : 'Unknown security status error.'],
          recommendedAction:
            'Compare with Windows Security and Windows Defender Firewall if current protection state matters.'
        })
      );

      return {
        baselineItemCount: 0,
        note: 'Initial security status check failed. The monitor will retry.'
      };
    }
  }

  start(): void {
    if (process.platform !== 'win32' || this.pollTimer) {
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
    if (process.platform !== 'win32') {
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
    try {
      const nextSnapshot = await this.provider.read();
      const previousSnapshot = this.currentSnapshot;
      const events: WatchdogEvent[] = [];

      if (
        !previousSnapshot ||
        getDefenderSignature(previousSnapshot.defender) !==
          getDefenderSignature(nextSnapshot.defender)
      ) {
        events.push(createDefenderEvent(nextSnapshot.defender, Boolean(previousSnapshot)));
      }

      if (
        !previousSnapshot ||
        getFirewallSignature(previousSnapshot.firewallProfiles) !==
          getFirewallSignature(nextSnapshot.firewallProfiles)
      ) {
        events.push(
          createFirewallEvent(nextSnapshot.firewallProfiles, Boolean(previousSnapshot))
        );
      }

      this.currentSnapshot = nextSnapshot;

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
          source: 'defender-status',
          category: 'security',
          severity: 'info',
          kind: 'status',
          confidence: 'low',
          title: 'Security status refresh missed a polling cycle',
          description:
            'Sovereign could not refresh Defender or firewall status for one interval.',
          rationale:
            'The security status provider failed during the current polling window.',
          whyThisMatters:
            'A missed cycle reduces confidence in the freshness of the current protection snapshot.',
          evidence: [error instanceof Error ? error.message : 'Unknown security polling error.'],
          recommendedAction:
            'The monitor will retry automatically. Use Windows Security if you need an immediate answer.'
        })
      );
    }
  }

  private createEvents(
    snapshot: SecurityStatusSnapshot,
    hasPreviousSnapshot: boolean
  ): WatchdogEvent[] {
    return [
      createDefenderEvent(snapshot.defender, hasPreviousSnapshot),
      createFirewallEvent(snapshot.firewallProfiles, hasPreviousSnapshot)
    ];
  }
}
