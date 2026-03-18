import { startTransition, useDeferredValue, useEffect, useState } from 'react';

import type {
  SystemMetricsSnapshot,
  WatchdogCategory,
  WatchdogEvent,
  WatchdogSeverity
} from '@shared/models';

import { EventDetailPanel } from './components/EventDetailPanel';
import { EventFilters } from './components/EventFilters';
import { EventTimeline } from './components/EventTimeline';
import { MetricCard } from './components/MetricCard';
import { ProcessesTable } from './components/ProcessesTable';
import {
  formatBytes,
  formatClock,
  formatPercentage,
  formatRate
} from './utils/formatters';

const EVENT_LIMIT = 12;
const NETWORK_GAUGE_MAX = 20 * 1024 * 1024;

const PLATFORM_LABELS: Record<SystemMetricsSnapshot['platform'], string> = {
  windows: 'Windows probe profile',
  macos: 'macOS fallback profile',
  linux: 'Linux fallback profile',
  unknown: 'Generic probe profile'
};

const EMPTY_ACTIONS = ['Loading the first live metrics snapshot.'];

export const App = () => {
  const [snapshot, setSnapshot] = useState<SystemMetricsSnapshot | null>(null);
  const [events, setEvents] = useState<WatchdogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<'all' | WatchdogSeverity>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | WatchdogCategory>('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadSnapshot = async (): Promise<void> => {
      try {
        const initialSnapshot = await window.sovereign.getDashboardSnapshot();

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setSnapshot(initialSnapshot);
        });
      } catch (cause) {
        if (!isMounted) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to load the dashboard telemetry.'
        );
      }
    };

    void loadSnapshot();

    const unsubscribe = window.sovereign.onDashboardUpdated((nextSnapshot) => {
      if (!isMounted) {
        return;
      }

      startTransition(() => {
        setSnapshot(nextSnapshot);
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadEvents = async (): Promise<void> => {
      try {
        const recentEvents = await window.sovereign.listRecentEvents({
          limit: EVENT_LIMIT,
          severities: severityFilter === 'all' ? undefined : [severityFilter],
          categories: categoryFilter === 'all' ? undefined : [categoryFilter]
        });

        if (!isMounted) {
          return;
        }

        startTransition(() => {
          setEvents(recentEvents);
          setSelectedEventId((currentSelection) =>
            recentEvents.some((event) => event.id === currentSelection)
              ? currentSelection
              : recentEvents[0]?.id || null
          );
        });
      } catch (cause) {
        if (!isMounted) {
          return;
        }

        setError(
          cause instanceof Error
            ? cause.message
            : 'Unable to refresh the watchdog timeline.'
        );
      }
    };

    void loadEvents();

    const unsubscribe = window.sovereign.onEventsUpdated(() => {
      void loadEvents();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [severityFilter, categoryFilter]);

  const deferredProcesses = useDeferredValue(snapshot?.topProcesses ?? []);
  const healthStatus = snapshot?.health.status ?? 'healthy';
  const healthActions = snapshot?.health.actions ?? EMPTY_ACTIONS;
  const networkUsagePercent = snapshot
    ? Math.min((snapshot.network.totalBytesPerSec / NETWORK_GAUGE_MAX) * 100, 100)
    : 0;
  const selectedEvent =
    events.find((event) => event.id === selectedEventId) ?? events[0] ?? null;

  return (
    <main className="app-shell">
      <header className="panel hero-panel">
        <div className="hero-copy">
          <p className="section-kicker">Continental / Sovereign</p>
          <h1>Desktop awareness dashboard</h1>
          <p className="hero-description">
            Transparent system insight for everyday operations. Phase 2 adds an
            explainable watchdog layer that stays in user space and surfaces
            changes without claiming certainty it cannot prove.
          </p>
          <div className="hero-meta">
            <span className={`status-pill status-${healthStatus}`}>
              {snapshot?.health.headline || 'Connecting telemetry'}
            </span>
            <span className="hero-meta-copy">
              {snapshot
                ? `${PLATFORM_LABELS[snapshot.platform]} · Refreshed ${formatClock(
                    snapshot.collectedAt
                  )}`
                : 'Initializing typed IPC, telemetry services, and the local event store'}
            </span>
          </div>
        </div>

        <div className="hero-summary">
          <p className="section-kicker">System health</p>
          <h2>{snapshot?.health.headline || 'Waiting for the first live snapshot'}</h2>
          <p>
            {snapshot?.health.summary ||
              'The dashboard will populate once the main process completes its first telemetry sample.'}
          </p>
          <ul className="action-list">
            {healthActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>
      </header>

      {error ? (
        <section className="panel error-banner">
          <p className="section-kicker">Telemetry error</p>
          <h2>The dashboard could not load one or more data feeds.</h2>
          <p>{error}</p>
        </section>
      ) : null}

      <section className="metrics-grid">
        <MetricCard
          title="CPU"
          value={snapshot ? `${formatPercentage(snapshot.cpu.usagePercent)} in use` : 'Loading'}
          detail={
            snapshot
              ? `${snapshot.cpu.coreCount} logical cores · load avg ${snapshot.cpu.loadAverage
                  .map((value) => value.toFixed(2))
                  .join(' / ')}`
              : 'Collecting live processor data'
          }
          insight={snapshot?.cpu.advice.headline || 'Sampling the processor telemetry service'}
          action={snapshot?.cpu.advice.action || 'Waiting for the first snapshot'}
          usagePercent={snapshot?.cpu.usagePercent || 0}
          status={snapshot?.cpu.status || 'healthy'}
        />

        <MetricCard
          title="Memory"
          value={
            snapshot
              ? `${formatBytes(snapshot.memory.usedBytes)} / ${formatBytes(
                  snapshot.memory.totalBytes
                )}`
              : 'Loading'
          }
          detail={
            snapshot
              ? `${formatPercentage(snapshot.memory.usagePercent)} committed`
              : 'Collecting live memory data'
          }
          insight={snapshot?.memory.advice.headline || 'Waiting for memory telemetry'}
          action={snapshot?.memory.advice.action || 'Waiting for the first snapshot'}
          usagePercent={snapshot?.memory.usagePercent || 0}
          status={snapshot?.memory.status || 'healthy'}
        />

        <MetricCard
          title="Disk"
          value={
            snapshot
              ? `${formatBytes(snapshot.disk.usedBytes)} / ${formatBytes(snapshot.disk.totalBytes)}`
              : 'Loading'
          }
          detail={
            snapshot
              ? `${snapshot.disk.volumes.length} tracked volume${
                  snapshot.disk.volumes.length === 1 ? '' : 's'
                } · ${formatPercentage(snapshot.disk.usagePercent)} used`
              : 'Collecting storage telemetry'
          }
          insight={snapshot?.disk.advice.headline || 'Waiting for storage telemetry'}
          action={snapshot?.disk.advice.action || 'Waiting for the first snapshot'}
          usagePercent={snapshot?.disk.usagePercent || 0}
          status={snapshot?.disk.status || 'healthy'}
        />

        <MetricCard
          title="Network"
          value={
            snapshot
              ? `${formatRate(snapshot.network.receiveBytesPerSec)} down · ${formatRate(
                  snapshot.network.transmitBytesPerSec
                )} up`
              : 'Loading'
          }
          detail={
            snapshot
              ? `${snapshot.network.activeInterfaces} active interface${
                  snapshot.network.activeInterfaces === 1 ? '' : 's'
                } · ${formatRate(snapshot.network.totalBytesPerSec)} combined`
              : 'Collecting network telemetry'
          }
          insight={snapshot?.network.advice.headline || 'Waiting for network telemetry'}
          action={snapshot?.network.advice.action || 'Waiting for the first snapshot'}
          usagePercent={networkUsagePercent}
          status={snapshot?.network.status || 'healthy'}
        />
      </section>

      <section className="content-grid">
        <ProcessesTable processes={deferredProcesses} />
        <div className="event-column">
          <section className="panel timeline-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Recent events</p>
                <h2>Watchdog timeline</h2>
              </div>
              <p className="panel-meta">
                Filters update the persisted timeline so you can separate baseline
                activity from explainable alerts.
              </p>
            </div>

            <EventFilters
              severityFilter={severityFilter}
              categoryFilter={categoryFilter}
              onSeverityChange={setSeverityFilter}
              onCategoryChange={setCategoryFilter}
            />

            <EventTimeline
              events={events}
              selectedEventId={selectedEvent?.id || null}
              onSelectEvent={setSelectedEventId}
            />
          </section>

          <EventDetailPanel event={selectedEvent} />
        </div>
      </section>
    </main>
  );
};
