import type { SecurityStatusSnapshot } from '@main/watchdog/types';
import { isMacosFirewallEnabled } from '@main/platform/macos/launchd';
import { runMacosTextCommand } from '@main/platform/macos/runMacosCommand';

const SOCKET_FILTER_FIREWALL = '/usr/libexec/ApplicationFirewall/socketfilterfw';

const parseEnabledState = (value: string): boolean | null => isMacosFirewallEnabled(value);

const readGatekeeperStatus = async (): Promise<SecurityStatusSnapshot['gatekeeper']> => {
  try {
    const output = await runMacosTextCommand('spctl', ['--status'], {
      allowNonZeroExit: true
    });
    const assessmentsEnabled = parseEnabledState(output);

    return {
      available: assessmentsEnabled !== null,
      assessmentsEnabled,
      error: assessmentsEnabled == null ? output || 'Gatekeeper status output was unreadable.' : null
    };
  } catch (error) {
    return {
      available: false,
      assessmentsEnabled: null,
      error: error instanceof Error ? error.message : 'Unknown Gatekeeper status error.'
    };
  }
};

const readApplicationFirewallStatus = async (): Promise<
  SecurityStatusSnapshot['applicationFirewall']
> => {
  try {
    const [enabledOutput, stealthOutput, blockAllOutput] = await Promise.all([
      runMacosTextCommand(SOCKET_FILTER_FIREWALL, ['--getglobalstate'], {
        allowNonZeroExit: true
      }),
      runMacosTextCommand(SOCKET_FILTER_FIREWALL, ['--getstealthmode'], {
        allowNonZeroExit: true
      }),
      runMacosTextCommand(SOCKET_FILTER_FIREWALL, ['--getblockall'], {
        allowNonZeroExit: true
      })
    ]);
    const enabled = parseEnabledState(enabledOutput);
    const stealthModeEnabled = parseEnabledState(stealthOutput);
    const blockAllIncomingEnabled = parseEnabledState(blockAllOutput);

    return {
      available:
        enabled !== null || stealthModeEnabled !== null || blockAllIncomingEnabled !== null,
      enabled,
      stealthModeEnabled,
      blockAllIncomingEnabled,
      error:
        enabled !== null || stealthModeEnabled !== null || blockAllIncomingEnabled !== null
          ? null
          : enabledOutput || stealthOutput || blockAllOutput || 'Firewall status output was unreadable.'
    };
  } catch (error) {
    return {
      available: false,
      enabled: null,
      stealthModeEnabled: null,
      blockAllIncomingEnabled: null,
      error:
        error instanceof Error ? error.message : 'Unknown Application Firewall status error.'
    };
  }
};

export class MacosSecurityStatusProvider {
  async read(): Promise<SecurityStatusSnapshot> {
    const [gatekeeper, applicationFirewall] = await Promise.all([
      readGatekeeperStatus(),
      readApplicationFirewallStatus()
    ]);

    return {
      defender: null,
      gatekeeper,
      firewallProfiles: [],
      applicationFirewall,
      checkedAt: new Date().toISOString()
    };
  }
}
