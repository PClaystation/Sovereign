import type { SystemMetricsSnapshot } from '@shared/models';
import type { SystemProbe } from '@main/platform/systemProbe';

type SnapshotListener = (snapshot: SystemMetricsSnapshot) => void;

export class DashboardService {
  private currentSnapshot: SystemMetricsSnapshot | null = null;
  private refreshTimer: NodeJS.Timeout | undefined;
  private readonly listeners = new Set<SnapshotListener>();

  constructor(
    private readonly probe: SystemProbe,
    private readonly refreshIntervalMs: number
  ) {}

  async initialize(): Promise<void> {
    this.currentSnapshot = await this.probe.collectSnapshot();
  }

  async getSnapshot(): Promise<SystemMetricsSnapshot> {
    if (!this.currentSnapshot) {
      await this.initialize();
    }

    return this.currentSnapshot as SystemMetricsSnapshot;
  }

  start(): void {
    if (this.refreshTimer) {
      return;
    }

    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, this.refreshIntervalMs);
  }

  stop(): void {
    if (!this.refreshTimer) {
      return;
    }

    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  subscribe(listener: SnapshotListener): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  private async refresh(): Promise<void> {
    try {
      const snapshot = await this.probe.collectSnapshot();
      this.currentSnapshot = snapshot;
      this.listeners.forEach((listener) => listener(snapshot));
    } catch (error) {
      console.error('[dashboard] failed to refresh metrics', error);
    }
  }
}
