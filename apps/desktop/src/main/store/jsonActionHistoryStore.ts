import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import type { FixActionResult } from '@shared/models';

import type { ActionHistoryStore } from './actionHistoryStore';

interface ActionHistoryStoreFile {
  version: 1;
  history: FixActionResult[];
}

const EMPTY_STORE: ActionHistoryStoreFile = {
  version: 1,
  history: []
};

const isNotFoundError = (error: unknown): error is NodeJS.ErrnoException =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

const sortByNewest = (left: FixActionResult, right: FixActionResult): number =>
  Date.parse(right.timestamp) - Date.parse(left.timestamp);

export class JsonActionHistoryStore implements ActionHistoryStore {
  constructor(
    private readonly storePath: string,
    private readonly maxEntries = 120
  ) {}

  async initialize(): Promise<void> {
    await this.readStore();
  }

  async list(limit = 10): Promise<FixActionResult[]> {
    const currentStore = await this.readStore();
    return [...currentStore.history].sort(sortByNewest).slice(0, Math.max(limit, 1));
  }

  async append(resultsInput: FixActionResult | FixActionResult[]): Promise<void> {
    const currentStore = await this.readStore();
    const results = Array.isArray(resultsInput) ? resultsInput : [resultsInput];

    await this.writeStore({
      version: 1,
      history: [...currentStore.history, ...results].sort(sortByNewest).slice(0, this.maxEntries)
    });
  }

  private async readStore(): Promise<ActionHistoryStoreFile> {
    await mkdir(path.dirname(this.storePath), { recursive: true });

    try {
      const rawStore = await readFile(this.storePath, 'utf8');
      const parsedStore = JSON.parse(rawStore) as Partial<ActionHistoryStoreFile>;

      if (Array.isArray(parsedStore.history)) {
        return {
          version: 1,
          history: parsedStore.history as FixActionResult[]
        };
      }
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.warn('[actions] failed to read action history store, resetting file', error);
      }

      await this.writeStore(EMPTY_STORE);
      return EMPTY_STORE;
    }

    await this.writeStore(EMPTY_STORE);
    return EMPTY_STORE;
  }

  private async writeStore(store: ActionHistoryStoreFile): Promise<void> {
    await writeFile(this.storePath, JSON.stringify(store, null, 2), 'utf8');
  }
}
