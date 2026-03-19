import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import type { WatchdogEvent, WatchdogEventQuery } from '@shared/models';

import type { EventStore } from './eventStore';
import { createSeedEvents } from './seedEvents';

interface EventStoreFile {
  version: 1;
  events: WatchdogEvent[];
}

const EMPTY_STORE: EventStoreFile = {
  version: 1,
  events: []
};

const isNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const sortByNewest = (left: WatchdogEvent, right: WatchdogEvent): number =>
  Date.parse(right.timestamp) - Date.parse(left.timestamp);

const migrateLegacyEvent = (event: WatchdogEvent): WatchdogEvent => {
  if (event.title !== 'Phase 2 watchdog feeds are not active yet') {
    return {
      ...event,
      source: event.source || 'watchdog'
    };
  }

  return {
    ...event,
    source: event.source || 'watchdog',
    title: 'Watchdog layer is online',
    description:
      'Process launch monitoring and safe Windows watchdog providers can now feed the recent events timeline when the platform supports them.',
    evidence: [
      'Severity rules stay heuristic and explainable',
      'Windows-only sources degrade gracefully on other platforms'
    ],
    recommendedAction:
      'Use the filters to separate baseline informational events from unusual or suspicious activity.'
  };
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
        event.recommendedAction,
        event.source,
        event.category,
        event.severity,
        ...event.evidence
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchText)
    );
  }

  return filteredEvents.slice(0, query.limit ?? 8);
};

export class JsonEventStore implements EventStore {
  constructor(
    private readonly storePath: string,
    private readonly maxEvents = 300
  ) {}

  async initialize(): Promise<void> {
    const currentStore = await this.readStore();

    if (currentStore.events.length > 0) {
      return;
    }

    await this.writeStore({
      version: 1,
      events: createSeedEvents().sort(sortByNewest)
    });
  }

  async list(query: WatchdogEventQuery = {}): Promise<WatchdogEvent[]> {
    const currentStore = await this.readStore();
    return applyQuery(currentStore.events, query);
  }

  async append(events: WatchdogEvent | WatchdogEvent[]): Promise<void> {
    const currentStore = await this.readStore();
    const incomingEvents = Array.isArray(events) ? events : [events];

    await this.writeStore({
      version: 1,
      events: [...currentStore.events, ...incomingEvents]
        .sort(sortByNewest)
        .slice(0, this.maxEvents)
    });
  }

  private async readStore(): Promise<EventStoreFile> {
    await mkdir(path.dirname(this.storePath), { recursive: true });

    try {
      const rawStore = await readFile(this.storePath, 'utf8');
      const parsedStore = JSON.parse(rawStore) as Partial<EventStoreFile>;

      if (Array.isArray(parsedStore.events)) {
        return {
          version: 1,
          events: parsedStore.events.map((event) =>
            migrateLegacyEvent(event as WatchdogEvent)
          )
        };
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.warn('[events] failed to read event store, resetting file', error);
      }

      await this.writeStore(EMPTY_STORE);
      return EMPTY_STORE;
    }

    await this.writeStore(EMPTY_STORE);
    return EMPTY_STORE;
  }

  private async writeStore(store: EventStoreFile): Promise<void> {
    await writeFile(this.storePath, JSON.stringify(store, null, 2), 'utf8');
  }
}
