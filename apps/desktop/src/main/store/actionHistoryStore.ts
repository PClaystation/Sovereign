import type { FixActionResult } from '@shared/models';

export interface ActionHistoryStore {
  initialize(): Promise<void>;
  list(limit?: number): Promise<FixActionResult[]>;
  append(results: FixActionResult | FixActionResult[]): Promise<void>;
}
