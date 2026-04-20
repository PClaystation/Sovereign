import type {
  WatchdogCategory,
  WatchdogConfidence,
  WatchdogEvent,
  WatchdogEventKind,
  WatchdogSourceId,
  WatchdogSuppressionRule
} from '@shared/models';

const normalizePath = (candidate: string | null | undefined): string =>
  (candidate || '').replace(/\\/g, '/').toLowerCase().trim();

export const WATCHDOG_CATEGORY_LABELS: Record<WatchdogCategory, string> = {
  application: 'Application',
  system: 'System',
  process: 'Process',
  network: 'Network',
  storage: 'Storage',
  security: 'Security'
};

export const WATCHDOG_SOURCE_LABELS: Record<WatchdogSourceId, string> = {
  watchdog: 'Watchdog',
  'process-launch': 'Process launches',
  'startup-items': 'Startup items',
  'scheduled-tasks': 'Scheduled tasks',
  'defender-status': 'Defender status',
  'firewall-status': 'Firewall status'
};

export const WATCHDOG_KIND_LABELS: Record<WatchdogEventKind, string> = {
  status: 'Status',
  baseline: 'Baseline',
  change: 'Change',
  incident: 'Incident',
  summary: 'Summary'
};

export const WATCHDOG_CONFIDENCE_LABELS: Record<WatchdogConfidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence'
};

export const findMatchingSuppression = (
  event: WatchdogEvent,
  suppressions: WatchdogSuppressionRule[]
): WatchdogSuppressionRule | null => {
  const normalizedSubjectPath = normalizePath(event.subjectPath);

  return (
    suppressions.find((rule) => {
      if (rule.source !== 'any' && rule.source !== event.source) {
        return false;
      }

      if (rule.kind === 'path') {
        return normalizedSubjectPath.length > 0 && normalizePath(rule.value) === normalizedSubjectPath;
      }

      return rule.value.trim() === event.fingerprint;
    }) || null
  );
};
