import type {
  FixActionResult,
  MetricStatus,
  SystemMetricsSnapshot,
  WatchdogEvent,
  WatchdogMonitorRuntime
} from '@shared/models';

export interface PostureHighlight {
  label: string;
  value: string;
  detail: string;
}

export interface PostureInsight {
  score: number;
  status: MetricStatus;
  headline: string;
  summary: string;
  dominantPressure: string;
  readiness: string;
  coverage: string;
  highlights: PostureHighlight[];
  recommendedActions: string[];
}

const STATUS_WEIGHT: Record<MetricStatus, number> = {
  healthy: 0,
  elevated: 1,
  stressed: 2
};

const clampScore = (value: number): number => Math.min(100, Math.max(0, Math.round(value)));

const getHighestStatus = (statuses: MetricStatus[]): MetricStatus =>
  statuses.reduce<MetricStatus>((currentStatus, nextStatus) =>
    STATUS_WEIGHT[nextStatus] > STATUS_WEIGHT[currentStatus] ? nextStatus : currentStatus
  , 'healthy');

export const derivePostureInsight = (
  snapshot: SystemMetricsSnapshot | null,
  events: WatchdogEvent[],
  monitorStatuses: WatchdogMonitorRuntime[],
  actionHistory: FixActionResult[]
): PostureInsight | null => {
  if (!snapshot) {
    return null;
  }

  const suspiciousEventCount = events.filter((event) => event.severity === 'suspicious').length;
  const unusualEventCount = events.filter((event) => event.severity === 'unusual').length;
  const degradedMonitorCount = monitorStatuses.filter(
    (status) => status.state === 'degraded'
  ).length;
  const activeMonitorCount = monitorStatuses.filter(
    (status) => status.enabled && status.supported
  ).length;
  const recentFailures = actionHistory.slice(0, 5).filter((result) => !result.success).length;

  const score = clampScore(
    100 -
      (snapshot.cpu.status === 'stressed' ? 18 : snapshot.cpu.status === 'elevated' ? 8 : 0) -
      (snapshot.memory.status === 'stressed'
        ? 18
        : snapshot.memory.status === 'elevated'
          ? 8
          : 0) -
      (snapshot.disk.status === 'stressed' ? 18 : snapshot.disk.status === 'elevated' ? 8 : 0) -
      (snapshot.network.status === 'stressed'
        ? 14
        : snapshot.network.status === 'elevated'
          ? 6
          : 0) -
      suspiciousEventCount * 10 -
      unusualEventCount * 4 -
      degradedMonitorCount * 8 -
      recentFailures * 5
  );

  const highestStatus = getHighestStatus([
    snapshot.cpu.status,
    snapshot.memory.status,
    snapshot.disk.status,
    snapshot.network.status,
    suspiciousEventCount > 0 ? 'stressed' : unusualEventCount > 0 ? 'elevated' : 'healthy',
    degradedMonitorCount > 0 ? 'elevated' : 'healthy'
  ]);

  const dominantPressure =
    highestStatus === snapshot.memory.status
      ? 'Memory pressure is the dominant load right now.'
      : highestStatus === snapshot.disk.status
        ? 'Storage headroom is the tightest constraint in the current snapshot.'
        : highestStatus === snapshot.network.status
          ? 'Network throughput is unusually active compared with the other resources.'
          : highestStatus === 'stressed' && suspiciousEventCount > 0
            ? 'Recent suspicious watchdog events are driving the current posture down.'
            : 'CPU demand is the strongest visible pressure in the current snapshot.';

  const headline =
    score >= 86
      ? 'System posture is stable'
      : score >= 70
        ? 'System posture is elevated'
        : score >= 55
          ? 'System posture needs review'
          : 'System posture needs intervention';

  const summary =
    score >= 86
      ? 'Telemetry, monitor coverage, and recent operator actions all look consistent with a healthy workstation baseline.'
      : score >= 70
        ? 'The machine is still manageable, but one or more resources or watchdog feeds deserve closer attention before this becomes friction.'
        : score >= 55
          ? 'Pressure or suspicious activity is visible across the current snapshot. Investigate the top processes and timeline before making assumptions.'
          : 'This snapshot shows sustained pressure, suspicious activity, or degraded monitor coverage. Triage before attempting broad changes.';

  const readiness =
    recentFailures > 0
      ? `${recentFailures} recent fixer action${recentFailures === 1 ? '' : 's'} failed`
      : actionHistory.length > 0
        ? 'Recent fixer actions completed cleanly'
        : 'No repair actions have been recorded yet';

  const coverage =
    degradedMonitorCount > 0
      ? `${degradedMonitorCount} watchdog feed${degradedMonitorCount === 1 ? '' : 's'} degraded`
      : `${activeMonitorCount}/${monitorStatuses.length || 1} watchdog feeds active`;

  const recommendedActions = [
    suspiciousEventCount > 0
      ? 'Prioritize suspicious timeline events before acting on informational noise.'
      : snapshot.health.actions[0],
    highestStatus !== 'healthy'
      ? dominantPressure
      : 'Use the current snapshot as a healthy baseline for future comparisons.',
    degradedMonitorCount > 0
      ? 'Review degraded watchdog feeds and refresh diagnostics before trusting incomplete coverage.'
      : 'Keep diagnostics refreshed after making external system changes.'
  ]
    .filter(Boolean)
    .slice(0, 3);

  return {
    score,
    status: highestStatus,
    headline,
    summary,
    dominantPressure,
    readiness,
    coverage,
    highlights: [
      {
        label: 'Pressure score',
        value: `${score}/100`,
        detail: snapshot.health.headline
      },
      {
        label: 'Event pressure',
        value: `${suspiciousEventCount} suspicious`,
        detail: `${unusualEventCount} unusual in the current view`
      },
      {
        label: 'Watchdog coverage',
        value: `${activeMonitorCount}/${monitorStatuses.length || 1} active`,
        detail:
          degradedMonitorCount > 0
            ? `${degradedMonitorCount} degraded feed${degradedMonitorCount === 1 ? '' : 's'}`
            : 'No degraded feeds reported'
      }
    ],
    recommendedActions
  };
};
