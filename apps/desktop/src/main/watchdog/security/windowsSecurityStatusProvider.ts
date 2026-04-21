import type {
  DefenderStatusSnapshot,
  FirewallProfileSnapshot,
  SecurityStatusSnapshot
} from '@main/watchdog/types';
import { toArray } from '@main/watchdog/helpers';

import { runPowerShellObject } from '../windows/runPowerShell';

interface RawDefenderStatus {
  Available?: boolean;
  AntivirusEnabled?: boolean;
  RealTimeProtectionEnabled?: boolean;
  BehaviorMonitorEnabled?: boolean;
  IoavProtectionEnabled?: boolean;
  AntispywareEnabled?: boolean;
  ServiceEnabled?: boolean;
  Error?: string;
}

interface RawFirewallProfile {
  Name?: string;
  Enabled?: boolean;
  DefaultInboundAction?: string;
  DefaultOutboundAction?: string;
  Error?: string;
}

interface RawSecurityPayload {
  Defender?: RawDefenderStatus | null;
  FirewallProfiles?: RawFirewallProfile | RawFirewallProfile[] | null;
}

const SECURITY_STATUS_COMMAND = `
$defender = $null
try {
  $mp = Get-MpComputerStatus
  $defender = [PSCustomObject]@{
    Available = $true
    AntivirusEnabled = $mp.AntivirusEnabled
    RealTimeProtectionEnabled = $mp.RealTimeProtectionEnabled
    BehaviorMonitorEnabled = $mp.BehaviorMonitorEnabled
    IoavProtectionEnabled = $mp.IoavProtectionEnabled
    AntispywareEnabled = $mp.AntispywareEnabled
    ServiceEnabled = $mp.AMServiceEnabled
  }
} catch {
  $defender = [PSCustomObject]@{
    Available = $false
    Error = $_.Exception.Message
  }
}

$firewall = @()
try {
  $firewall = Get-NetFirewallProfile |
    Sort-Object Name |
    ForEach-Object {
      [PSCustomObject]@{
        Name = $_.Name
        Enabled = $_.Enabled
        DefaultInboundAction = $_.DefaultInboundAction.ToString()
        DefaultOutboundAction = $_.DefaultOutboundAction.ToString()
      }
    }
} catch {
  $firewall = @([PSCustomObject]@{
    Name = "Unavailable"
    Enabled = $false
    Error = $_.Exception.Message
  })
}

[PSCustomObject]@{
  Defender = $defender
  FirewallProfiles = $firewall
} | ConvertTo-Json -Depth 4 -Compress
`;

const mapDefenderStatus = (
  defenderStatus: RawDefenderStatus | null | undefined
): DefenderStatusSnapshot | null => {
  if (!defenderStatus) {
    return null;
  }

  return {
    available: Boolean(defenderStatus.Available),
    antivirusEnabled:
      typeof defenderStatus.AntivirusEnabled === 'boolean'
        ? defenderStatus.AntivirusEnabled
        : null,
    realTimeProtectionEnabled:
      typeof defenderStatus.RealTimeProtectionEnabled === 'boolean'
        ? defenderStatus.RealTimeProtectionEnabled
        : null,
    behaviorMonitorEnabled:
      typeof defenderStatus.BehaviorMonitorEnabled === 'boolean'
        ? defenderStatus.BehaviorMonitorEnabled
        : null,
    ioavProtectionEnabled:
      typeof defenderStatus.IoavProtectionEnabled === 'boolean'
        ? defenderStatus.IoavProtectionEnabled
        : null,
    antispywareEnabled:
      typeof defenderStatus.AntispywareEnabled === 'boolean'
        ? defenderStatus.AntispywareEnabled
        : null,
    serviceEnabled:
      typeof defenderStatus.ServiceEnabled === 'boolean'
        ? defenderStatus.ServiceEnabled
        : null,
    error: defenderStatus.Error?.trim() || null
  };
};

const mapFirewallProfiles = (
  firewallProfiles: RawFirewallProfile | RawFirewallProfile[] | null | undefined
): FirewallProfileSnapshot[] =>
  toArray(firewallProfiles).map((profile) => ({
    name: profile.Name?.trim() || 'Unnamed profile',
    enabled: typeof profile.Enabled === 'boolean' ? profile.Enabled : null,
    defaultInboundAction: profile.DefaultInboundAction?.trim() || null,
    defaultOutboundAction: profile.DefaultOutboundAction?.trim() || null,
    error: profile.Error?.trim() || null
  }));

export class WindowsSecurityStatusProvider {
  async read(): Promise<SecurityStatusSnapshot> {
    const rawPayload = await runPowerShellObject<RawSecurityPayload>(SECURITY_STATUS_COMMAND);

    return {
      defender: mapDefenderStatus(rawPayload?.Defender),
      gatekeeper: null,
      firewallProfiles: mapFirewallProfiles(rawPayload?.FirewallProfiles),
      applicationFirewall: null,
      checkedAt: new Date().toISOString()
    };
  }
}
