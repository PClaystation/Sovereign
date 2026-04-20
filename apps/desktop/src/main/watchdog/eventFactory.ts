import { randomUUID } from 'node:crypto';

import type {
  FileTrustInfo,
  WatchdogCategory,
  WatchdogConfidence,
  WatchdogEvent,
  WatchdogEventKind,
  WatchdogSeverity,
  WatchdogSourceId
} from '@shared/models';

import { buildKey, normalizePath } from './helpers';

interface CreateWatchdogEventInput {
  source: WatchdogSourceId;
  category: WatchdogCategory;
  severity: WatchdogSeverity;
  title: string;
  description: string;
  rationale: string;
  whyThisMatters: string;
  recommendedAction: string;
  confidence?: WatchdogConfidence;
  kind?: WatchdogEventKind;
  evidence?: string[];
  subjectName?: string | null;
  subjectPath?: string | null;
  correlationKey?: string | null;
  fingerprint?: string;
  pathSignals?: string[];
  relatedEventCount?: number;
  fileTrust?: FileTrustInfo | null;
  occurredAt?: string;
}

const dedupeStrings = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

export const createWatchdogEvent = ({
  source,
  category,
  severity,
  title,
  description,
  rationale,
  whyThisMatters,
  recommendedAction,
  confidence = 'medium',
  kind = 'incident',
  evidence = [],
  subjectName = null,
  subjectPath = null,
  correlationKey,
  fingerprint,
  pathSignals = [],
  relatedEventCount = 0,
  fileTrust = null,
  occurredAt
}: CreateWatchdogEventInput): WatchdogEvent => {
  const timestamp = occurredAt || new Date().toISOString();
  const normalizedSubjectPath = normalizePath(subjectPath);
  const resolvedCorrelationKey =
    correlationKey ||
    (normalizedSubjectPath ? `path|${normalizedSubjectPath}` : null) ||
    (subjectName ? `subject|${subjectName.trim().toLowerCase()}` : null);

  return {
    id: randomUUID(),
    timestamp,
    source,
    category,
    severity,
    kind,
    confidence,
    title,
    description,
    rationale,
    whyThisMatters,
    evidence: dedupeStrings(evidence),
    recommendedAction,
    fingerprint:
      fingerprint ||
      buildKey(source, kind, severity, subjectName, normalizedSubjectPath, title),
    correlationKey: resolvedCorrelationKey,
    subjectName: subjectName?.trim() || null,
    subjectPath: subjectPath?.trim() || null,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    occurrenceCount: 1,
    relatedEventCount,
    pathSignals: dedupeStrings(pathSignals),
    fileTrust
  };
};
