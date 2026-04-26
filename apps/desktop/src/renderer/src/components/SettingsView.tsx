import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type PlatformKey
} from '@shared/models';

interface SettingsViewProps {
  settings: AppSettings | null;
  platform: PlatformKey | null;
  isLoading: boolean;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  saveMessage: string | null;
  saveError: string | null;
  onChange: (settings: AppSettings) => void;
  onRemoveSuppression: (suppressionId: string) => void;
  onSave: () => void;
  onReset: () => void;
}

const PLATFORM_NOTES: Record<PlatformKey, string> = {
  windows:
    'Windows providers stay in user space. No drivers or persistence.',
  macos:
    'macOS uses standard user-space sources. Unsupported Windows feeds stay marked unsupported.',
  linux:
    'Linux uses a fallback profile. Windows and macOS controls stay unavailable.',
  unknown:
    'Some monitors depend on Windows or macOS APIs.'
};

const bytesPerSecondToMegabytes = (value: number): string =>
  (value / (1024 * 1024)).toFixed(1);

export const SettingsView = ({
  settings,
  platform,
  isLoading,
  isSaving,
  hasUnsavedChanges,
  saveMessage,
  saveError,
  onChange,
  onRemoveSuppression,
  onSave,
  onReset
}: SettingsViewProps) => {
  if (isLoading && !settings) {
    return (
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Settings</p>
            <h2>Loading configuration</h2>
          </div>
        </div>
        <div className="state-block">Loading settings.</div>
      </section>
    );
  }

  if (!settings) {
    return (
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Settings</p>
            <h2>Configuration unavailable</h2>
          </div>
        </div>
        <div className="state-block state-block-error">Could not load settings.</div>
      </section>
    );
  }

  const updatePercentThreshold = (
    resource: 'cpu' | 'memory' | 'disk',
    field: 'elevated' | 'stressed',
    value: number
  ): void => {
    onChange({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        [resource]: {
          ...settings.thresholds[resource],
          [field]: value
        }
      }
    });
  };

  const updateNetworkThreshold = (
    field: 'elevatedBytesPerSec' | 'stressedBytesPerSec',
    valueInMegabytes: number
  ): void => {
    onChange({
      ...settings,
      thresholds: {
        ...settings.thresholds,
        network: {
          ...settings.thresholds.network,
          [field]: Math.round(valueInMegabytes * 1024 * 1024)
        }
      }
    });
  };

  const updateMonitorToggle = (
    key: keyof AppSettings['monitors'],
    value: boolean
  ): void => {
    onChange({
      ...settings,
      monitors: {
        ...settings.monitors,
        [key]: value
      }
    });
  };

  const monitorCards =
    platform === 'macos'
      ? ([
          [
            'processLaunchMonitoring',
            'Process launches',
            'Compare the live process table to detect newly observed launches.'
          ],
          [
            'startupMonitoring',
            'Launch items',
            'Read visible LaunchAgents and LaunchDaemons and log additions or command changes.'
          ],
          [
            'scheduledTaskMonitoring',
            'Scheduled tasks',
            'Read visible launchd jobs with scheduled triggers. Next-run and last-run timestamps are not currently exposed through this safe user-space path.'
          ],
          [
            'securityStatusMonitoring',
            'Gatekeeper and firewall',
            'Re-check Gatekeeper and the macOS Application Firewall through standard command surfaces.'
          ]
        ] as const)
      : ([
          [
            'processLaunchMonitoring',
            'Process launches',
            'Compare the live process table to detect newly observed launches.'
          ],
          [
            'startupMonitoring',
            'Startup items',
            'Read visible Windows startup entries and log additions or command changes.'
          ],
          [
            'scheduledTaskMonitoring',
            'Scheduled tasks',
            'Read scheduled task summaries when Windows exposes them to the current user.'
          ],
          [
            'securityStatusMonitoring',
            'Defender and firewall',
            'Re-check Microsoft Defender and Windows Firewall status through standard command surfaces.'
          ]
        ] as const);

  return (
    <section className="settings-grid">
      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Thresholds</p>
            <h2>Severity guidance</h2>
          </div>
          <p className="panel-meta">Used for labels and summaries.</p>
        </div>

        <div className="settings-section-grid">
          {(['cpu', 'memory', 'disk'] as const).map((resource) => (
            <article
              key={resource}
              className="settings-card"
            >
              <h3>{resource.toUpperCase()}</h3>
              <label className="settings-field">
                <span>Elevated at</span>
                <input
                  type="number"
                  min={1}
                  max={98}
                  value={settings.thresholds[resource].elevated}
                  onChange={(event) =>
                    updatePercentThreshold(
                      resource,
                      'elevated',
                      Number(event.target.value)
                    )
                  }
                />
              </label>
              <label className="settings-field">
                <span>Stressed at</span>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={settings.thresholds[resource].stressed}
                  onChange={(event) =>
                    updatePercentThreshold(
                      resource,
                      'stressed',
                      Number(event.target.value)
                    )
                  }
                />
              </label>
            </article>
          ))}

          <article className="settings-card">
            <h3>Network</h3>
            <label className="settings-field">
              <span>Elevated at</span>
              <input
                type="number"
                min={0.1}
                max={500}
                step={0.1}
                value={bytesPerSecondToMegabytes(
                  settings.thresholds.network.elevatedBytesPerSec
                )}
                onChange={(event) =>
                  updateNetworkThreshold(
                    'elevatedBytesPerSec',
                    Number(event.target.value)
                  )
                }
              />
              <small>MB/s total</small>
            </label>
            <label className="settings-field">
              <span>Stressed at</span>
              <input
                type="number"
                min={0.2}
                max={500}
                step={0.1}
                value={bytesPerSecondToMegabytes(
                  settings.thresholds.network.stressedBytesPerSec
                )}
                onChange={(event) =>
                  updateNetworkThreshold(
                    'stressedBytesPerSec',
                    Number(event.target.value)
                  )
                }
              />
              <small>MB/s total</small>
            </label>
          </article>
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Watchdog coverage</p>
            <h2>Polling toggles</h2>
          </div>
          <p className="panel-meta">Turn monitors on or off.</p>
        </div>

        <div className="toggle-list">
          {monitorCards.map(([key, title, description]) => (
            <label
              key={key}
              className="toggle-card"
            >
              <div>
                <p className="inventory-title">{title}</p>
                <p className="inventory-copy">{description}</p>
              </div>
              <input
                type="checkbox"
                checked={settings.monitors[key]}
                onChange={(event) => updateMonitorToggle(key, event.target.checked)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Experience</p>
            <h2>Operator defaults</h2>
          </div>
        </div>

        <div className="settings-section-grid compact">
          <article className="settings-card">
            <label className="settings-field">
              <span>Recent events limit</span>
              <input
                type="number"
                min={5}
                max={50}
                value={settings.timelineEventLimit}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    timelineEventLimit: Number(event.target.value)
                  })
                }
              />
              <small>Visible timeline items.</small>
            </label>
          </article>

          <article className="settings-card">
            <label className="settings-field">
              <span>Telemetry refresh interval</span>
              <input
                type="number"
                min={1000}
                max={60000}
                step={1000}
                value={settings.metricsRefreshIntervalMs}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    metricsRefreshIntervalMs: Number(event.target.value)
                  })
                }
              />
              <small>Dashboard polling interval.</small>
            </label>
          </article>

          <article className="settings-card">
            <label className="settings-field">
              <span>Theme preference</span>
              <select
                value={settings.theme}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    theme: event.target.value as AppSettings['theme']
                  })
                }
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
              <small>App theme only.</small>
            </label>
          </article>

          <article className="settings-card">
            <label className="toggle-card stacked">
              <div>
                <p className="inventory-title">Telemetry summaries</p>
                <p className="inventory-copy">
                  Show extra summary text.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.enableTelemetrySummaries}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    enableTelemetrySummaries: event.target.checked
                  })
                }
              />
            </label>
          </article>

          <article className="settings-card">
            <label className="toggle-card stacked">
              <div>
                <p className="inventory-title">Show suppressed events</p>
                <p className="inventory-copy">
                  Keep suppressed events visible.
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.watchdog.showSuppressedEvents}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    watchdog: {
                      ...settings.watchdog,
                      showSuppressedEvents: event.target.checked
                    }
                  })
                }
              />
            </label>
          </article>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onReset}
            disabled={isSaving}
          >
            Restore defaults
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onSave}
            disabled={isSaving || !hasUnsavedChanges}
          >
            {isSaving ? 'Saving settings…' : 'Save settings'}
          </button>
        </div>

        <div className="settings-status-row">
          <p className="panel-meta-inline">
            Defaults: CPU {DEFAULT_APP_SETTINGS.thresholds.cpu.elevated}% /{' '}
            {DEFAULT_APP_SETTINGS.thresholds.cpu.stressed}% · timeline{' '}
            {DEFAULT_APP_SETTINGS.timelineEventLimit}
          </p>
          {saveMessage ? <p className="status-copy success">{saveMessage}</p> : null}
          {saveError ? <p className="status-copy failure">{saveError}</p> : null}
        </div>
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Noise control</p>
            <h2>Watchdog suppressions</h2>
          </div>
          <p className="panel-meta">Hide known-safe events.</p>
        </div>

        {settings.watchdog.suppressions.length > 0 ? (
          <div className="inventory-list">
            {settings.watchdog.suppressions.map((suppression) => (
              <div
                key={suppression.id}
                className="inventory-row"
              >
                <div>
                  <p className="inventory-title">{suppression.label}</p>
                  <p className="inventory-copy">
                    {suppression.kind} · {suppression.source}
                  </p>
                  <p className="inventory-copy">{suppression.value}</p>
                </div>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => onRemoveSuppression(suppression.id)}
                  disabled={isSaving}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="state-block">No suppressions saved.</div>
        )}
      </section>

      <section className="panel settings-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Platform note</p>
            <h2>Honest limits</h2>
          </div>
        </div>
        <div className="detail-callout">
          <p>{PLATFORM_NOTES[platform || 'unknown']}</p>
        </div>
      </section>
    </section>
  );
};
