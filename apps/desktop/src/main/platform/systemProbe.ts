import type { SystemMetricsSnapshot } from '@shared/models';

export interface SystemProbe {
  collectSnapshot(): Promise<SystemMetricsSnapshot>;
}
