import type { WatchdogMonitorRuntime } from '@shared/models';

import { formatRelativeTime } from '../utils/formatters';

interface WatchdogCoveragePanelProps {
  statuses: WatchdogMonitorRuntime[];
  isLoading: boolean;
}

const formatPollingInterval = (value: number): string =>
  value >= 60_000 ? `${Math.round(value / 60_000)} min` : `${Math.round(value / 1000)} sec`;

export const WatchdogCoveragePanel = ({
  statuses,
  isLoading
}: WatchdogCoveragePanelProps) => {
  if (isLoading && statuses.length === 0) {
    return (
      <section className="panel coverage-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Watchdog coverage</p>
            <h2>Feed runtime health</h2>
          </div>
        </div>
        <p className="state-block">Reading monitor coverage and runtime state.</p>
      </section>
    );
  }

  return (
    <section className="panel coverage-panel">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Watchdog coverage</p>
          <h2>Feed runtime health</h2>
        </div>
        <p className="panel-meta">
          Active, degraded, and unsupported watchdog feeds are surfaced explicitly.
        </p>
      </div>

      <div className="coverage-list">
        {statuses.map((status) => (
          <article
            key={status.id}
            className="coverage-card"
          >
            <div className="coverage-card-header">
              <div>
                <h3>{status.title}</h3>
                <p>{status.description}</p>
              </div>
              <span className={`status-pill status-${status.state}`}>
                {status.state}
              </span>
            </div>

            <div className="coverage-meta">
              <span>{status.enabled ? 'Enabled' : 'Disabled'}</span>
              <span>{status.supported ? 'Supported' : 'Platform-limited'}</span>
              <span>Poll {formatPollingInterval(status.pollingIntervalMs)}</span>
            </div>

            <div className="coverage-stat-row">
              <div className="coverage-stat">
                <span>Last checked</span>
                <strong>{formatRelativeTime(status.lastCheckedAt)}</strong>
              </div>
              <div className="coverage-stat">
                <span>Last event</span>
                <strong>{formatRelativeTime(status.lastEventAt)}</strong>
              </div>
              <div className="coverage-stat">
                <span>Baseline</span>
                <strong>
                  {status.baselineCapturedAt
                    ? `${formatRelativeTime(status.baselineCapturedAt)}${
                        status.baselineItemCount != null
                          ? ` · ${status.baselineItemCount} items`
                          : ''
                      }`
                    : 'Pending'}
                </strong>
              </div>
              <div className="coverage-stat">
                <span>Events recorded</span>
                <strong>{status.eventCount}</strong>
              </div>
            </div>

            {status.note ? <p className="panel-meta">{status.note}</p> : null}
            {status.lastError ? (
              <p className="coverage-error">{status.lastError}</p>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
};
