import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type {
  WatchdogConfidence,
  WatchdogEvent,
  WatchdogEventQuery,
  WatchdogSeverity
} from '@shared/models';

import type { EventStore } from './eventStore';
import type { SqliteDatabase } from './sqliteDatabase';

interface LegacyEventStoreFile {
  version: number;
  events: WatchdogEvent[];
}

const MAX_EVIDENCE_ITEMS = 12;

const sortByNewest = (left: WatchdogEvent, right: WatchdogEvent): number =>
  Date.parse(right.timestamp) - Date.parse(left.timestamp);

const CONFIDENCE_WEIGHT: Record<WatchdogConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

const SEVERITY_WEIGHT: Record<WatchdogSeverity, number> = {
  info: 0,
  unusual: 1,
  suspicious: 2
};

const applyQuery = (
  events: WatchdogEvent[],
  query: WatchdogEventQuery
): WatchdogEvent[] => {
  let filteredEvents = [...events].sort(sortByNewest);

  if (query.severities?.length) {
    filteredEvents = filteredEvents.filter((event) =>
      query.severities?.includes(event.severity)
    );
  }

  if (query.categories?.length) {
    filteredEvents = filteredEvents.filter((event) =>
      query.categories?.includes(event.category)
    );
  }

  if (query.sources?.length) {
    filteredEvents = filteredEvents.filter((event) =>
      query.sources?.includes(event.source)
    );
  }

  if (query.searchText?.trim()) {
    const searchText = query.searchText.trim().toLowerCase();

    filteredEvents = filteredEvents.filter((event) =>
      [
        event.title,
        event.description,
        event.rationale,
        event.whyThisMatters,
        event.recommendedAction,
        event.source,
        event.category,
        event.severity,
        event.subjectName || '',
        event.subjectPath || '',
        ...event.pathSignals,
        ...event.evidence
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchText)
    );
  }

  return filteredEvents.slice(0, query.limit ?? 12);
};

const dedupeStrings = (values: string[]): string[] =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))];

const maxSeverity = (left: WatchdogSeverity, right: WatchdogSeverity): WatchdogSeverity =>
  SEVERITY_WEIGHT[left] >= SEVERITY_WEIGHT[right] ? left : right;

const maxConfidence = (
  left: WatchdogConfidence,
  right: WatchdogConfidence
): WatchdogConfidence =>
  CONFIDENCE_WEIGHT[left] >= CONFIDENCE_WEIGHT[right] ? left : right;

const normalizeLegacyEvent = (candidate: Partial<WatchdogEvent>): WatchdogEvent => {
  const timestamp = candidate.timestamp || new Date().toISOString();
  const firstSeenAt = candidate.firstSeenAt || timestamp;
  const lastSeenAt = candidate.lastSeenAt || timestamp;
  const title = candidate.title?.trim() || 'Watchdog event';

  return {
    id: candidate.id || randomUUID(),
    timestamp,
    source: candidate.source || 'watchdog',
    category: candidate.category || 'application',
    severity: candidate.severity || 'info',
    kind: candidate.kind || 'status',
    confidence: candidate.confidence || 'low',
    title,
    description: candidate.description?.trim() || 'No event description was recorded.',
    rationale:
      candidate.rationale?.trim() ||
      'This event was migrated from an earlier Sovereign history format.',
    whyThisMatters:
      candidate.whyThisMatters?.trim() ||
      'Use the surrounding telemetry and OS tools to decide whether this matters.',
    evidence: dedupeStrings(candidate.evidence || []),
    recommendedAction:
      candidate.recommendedAction?.trim() ||
      'Review the surrounding system context before taking action.',
    fingerprint:
      candidate.fingerprint ||
      `${candidate.source || 'watchdog'}|${title.toLowerCase()}|${candidate.subjectPath || ''}`,
    correlationKey: candidate.correlationKey || null,
    subjectName: candidate.subjectName || null,
    subjectPath: candidate.subjectPath || null,
    firstSeenAt,
    lastSeenAt,
    occurrenceCount:
      typeof candidate.occurrenceCount === 'number' && candidate.occurrenceCount > 0
        ? Math.round(candidate.occurrenceCount)
        : 1,
    relatedEventCount:
      typeof candidate.relatedEventCount === 'number' && candidate.relatedEventCount >= 0
        ? Math.round(candidate.relatedEventCount)
        : 0,
    pathSignals: dedupeStrings(candidate.pathSignals || []),
    fileTrust: candidate.fileTrust || null
  };
};

const mergeEvent = (existingEvent: WatchdogEvent, incomingEvent: WatchdogEvent): WatchdogEvent => {
  const incomingIsNewer =
    Date.parse(incomingEvent.timestamp) >= Date.parse(existingEvent.timestamp);
  const newestEvent = incomingIsNewer ? incomingEvent : existingEvent;
  const oldestEvent = incomingIsNewer ? existingEvent : incomingEvent;

  return {
    ...newestEvent,
    id: existingEvent.id,
    severity: maxSeverity(existingEvent.severity, incomingEvent.severity),
    confidence: maxConfidence(existingEvent.confidence, incomingEvent.confidence),
    title: newestEvent.title || oldestEvent.title,
    description: newestEvent.description || oldestEvent.description,
    rationale: newestEvent.rationale || oldestEvent.rationale,
    whyThisMatters: newestEvent.whyThisMatters || oldestEvent.whyThisMatters,
    evidence: dedupeStrings([...existingEvent.evidence, ...incomingEvent.evidence]).slice(
      0,
      MAX_EVIDENCE_ITEMS
    ),
    recommendedAction:
      newestEvent.recommendedAction || oldestEvent.recommendedAction,
    correlationKey: newestEvent.correlationKey || oldestEvent.correlationKey,
    subjectName: newestEvent.subjectName || oldestEvent.subjectName,
    subjectPath: newestEvent.subjectPath || oldestEvent.subjectPath,
    firstSeenAt:
      Date.parse(existingEvent.firstSeenAt) <= Date.parse(incomingEvent.firstSeenAt)
        ? existingEvent.firstSeenAt
        : incomingEvent.firstSeenAt,
    lastSeenAt:
      Date.parse(existingEvent.lastSeenAt) >= Date.parse(incomingEvent.lastSeenAt)
        ? existingEvent.lastSeenAt
        : incomingEvent.lastSeenAt,
    occurrenceCount:
      Math.max(existingEvent.occurrenceCount, 1) +
      Math.max(incomingEvent.occurrenceCount, 1),
    relatedEventCount: Math.max(
      existingEvent.relatedEventCount,
      incomingEvent.relatedEventCount
    ),
    pathSignals: dedupeStrings([
      ...existingEvent.pathSignals,
      ...incomingEvent.pathSignals
    ]),
    fileTrust: incomingEvent.fileTrust || existingEvent.fileTrust
  };
};

const parseLegacyEvents = async (legacyPath?: string): Promise<WatchdogEvent[]> => {
  if (!legacyPath) {
    return [];
  }

  try {
    const rawStore = await readFile(legacyPath, 'utf8');
    const parsedStore = JSON.parse(rawStore) as Partial<LegacyEventStoreFile>;
    return Array.isArray(parsedStore.events)
      ? parsedStore.events.map((event) =>
          normalizeLegacyEvent(event as Partial<WatchdogEvent>)
        )
      : [];
  } catch {
    return [];
  }
};

export class SqliteEventStore implements EventStore {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly legacyEventsPath?: string,
    private readonly maxEvents = 500
  ) {}

  async initialize(): Promise<void> {
    await this.database.initialize();
    const currentCount = await this.database.read((database) => {
      const row = this.database.queryRows(
        database,
        `SELECT COUNT(*) AS count FROM watchdog_events`
      )[0];

      return Number(row?.count || 0);
    });

    if (currentCount > 0) {
      return;
    }

    const legacyEvents = await parseLegacyEvents(this.legacyEventsPath);
    if (legacyEvents.length > 0) {
      await this.append(legacyEvents);
    }
  }

  async list(query: WatchdogEventQuery = {}): Promise<WatchdogEvent[]> {
    const events = await this.database.read((database) =>
      this.database
        .queryRows(
          database,
          `SELECT payload FROM watchdog_events ORDER BY timestamp DESC`
        )
        .map((row) => normalizeLegacyEvent(JSON.parse(String(row.payload))))
    );

    return applyQuery(events, query);
  }

  async append(eventsInput: WatchdogEvent | WatchdogEvent[]): Promise<void> {
    const incomingEvents = (Array.isArray(eventsInput) ? eventsInput : [eventsInput]).map(
      normalizeLegacyEvent
    );

    await this.database.write((database) => {
      for (const incomingEvent of incomingEvents) {
        const existingRow = this.database.queryRows(
          database,
          `SELECT payload FROM watchdog_events WHERE fingerprint = ? LIMIT 1`,
          [incomingEvent.fingerprint]
        )[0];
        const nextEvent = existingRow
          ? mergeEvent(
              normalizeLegacyEvent(JSON.parse(String(existingRow.payload))),
              incomingEvent
            )
          : incomingEvent;

        database.run(
          `INSERT OR REPLACE INTO watchdog_events (id, fingerprint, timestamp, payload)
           VALUES (?, ?, ?, ?)`,
          [
            nextEvent.id,
            nextEvent.fingerprint,
            nextEvent.timestamp,
            JSON.stringify(nextEvent)
          ]
        );
      }

      database.run(
        `DELETE FROM watchdog_events
         WHERE id IN (
           SELECT id FROM watchdog_events
           ORDER BY timestamp DESC
           LIMIT -1 OFFSET ?
         )`,
        [this.maxEvents]
      );
    });
  }
}
