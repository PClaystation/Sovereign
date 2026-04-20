import { readFile } from 'node:fs/promises';

import type { FixActionResult } from '@shared/models';

import type { ActionHistoryStore } from './actionHistoryStore';
import type { SqliteDatabase } from './sqliteDatabase';

interface LegacyActionHistoryStoreFile {
  version: number;
  history: FixActionResult[];
}

const sortByNewest = (left: FixActionResult, right: FixActionResult): number =>
  Date.parse(right.timestamp) - Date.parse(left.timestamp);

const normalizeResult = (candidate: Partial<FixActionResult>): FixActionResult => ({
  actionId: candidate.actionId || `${candidate.kind || 'action'}-${Date.now()}`,
  kind: candidate.kind || 'refresh-diagnostics',
  success: Boolean(candidate.success),
  timestamp: candidate.timestamp || new Date().toISOString(),
  summary: candidate.summary?.trim() || 'Sovereign recorded an action result.',
  details: Array.isArray(candidate.details) ? candidate.details.map(String) : []
});

const parseLegacyHistory = async (legacyPath?: string): Promise<FixActionResult[]> => {
  if (!legacyPath) {
    return [];
  }

  try {
    const rawStore = await readFile(legacyPath, 'utf8');
    const parsedStore = JSON.parse(rawStore) as Partial<LegacyActionHistoryStoreFile>;
    return Array.isArray(parsedStore.history)
      ? parsedStore.history.map((entry) => normalizeResult(entry as Partial<FixActionResult>))
      : [];
  } catch {
    return [];
  }
};

export class SqliteActionHistoryStore implements ActionHistoryStore {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly legacyHistoryPath?: string,
    private readonly maxEntries = 200
  ) {}

  async initialize(): Promise<void> {
    await this.database.initialize();
    const currentCount = await this.database.read((database) => {
      const row = this.database.queryRows(
        database,
        `SELECT COUNT(*) AS count FROM action_history`
      )[0];

      return Number(row?.count || 0);
    });

    if (currentCount > 0) {
      return;
    }

    const legacyHistory = await parseLegacyHistory(this.legacyHistoryPath);
    if (legacyHistory.length > 0) {
      await this.append(legacyHistory);
    }
  }

  async list(limit = 10): Promise<FixActionResult[]> {
    return this.database.read((database) =>
      this.database
        .queryRows(
          database,
          `SELECT payload FROM action_history ORDER BY timestamp DESC LIMIT ?`,
          [Math.max(limit, 1)]
        )
        .map((row) => normalizeResult(JSON.parse(String(row.payload))))
        .sort(sortByNewest)
    );
  }

  async append(resultsInput: FixActionResult | FixActionResult[]): Promise<void> {
    const results = (Array.isArray(resultsInput) ? resultsInput : [resultsInput]).map(
      normalizeResult
    );

    await this.database.write((database) => {
      for (const result of results) {
        database.run(
          `INSERT OR REPLACE INTO action_history (action_id, timestamp, payload)
           VALUES (?, ?, ?)`,
          [result.actionId, result.timestamp, JSON.stringify(result)]
        );
      }

      database.run(
        `DELETE FROM action_history
         WHERE action_id IN (
           SELECT action_id FROM action_history
           ORDER BY timestamp DESC
           LIMIT -1 OFFSET ?
         )`,
        [this.maxEntries]
      );
    });
  }
}
