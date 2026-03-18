export type MetricStatus = 'healthy' | 'elevated' | 'stressed';
export type WatchdogSeverity = 'info' | 'unusual' | 'suspicious';
export type PlatformKey = 'windows' | 'macos' | 'linux' | 'unknown';
export type WatchdogSourceId =
  | 'watchdog'
  | 'process-launch'
  | 'startup-items'
  | 'scheduled-tasks'
  | 'defender-status'
  | 'firewall-status';

export interface ResourceAdvice {
  headline: string;
  details: string;
  action: string;
}

export interface CpuMetrics {
  usagePercent: number;
  coreCount: number;
  loadAverage: number[];
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface MemoryMetrics {
  usagePercent: number;
  usedBytes: number;
  totalBytes: number;
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface DiskVolume {
  name: string;
  mount: string;
  filesystem: string;
  sizeBytes: number;
  usedBytes: number;
  usagePercent: number;
}

export interface DiskMetrics {
  usagePercent: number;
  usedBytes: number;
  totalBytes: number;
  volumes: DiskVolume[];
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface NetworkMetrics {
  receiveBytesPerSec: number;
  transmitBytesPerSec: number;
  totalBytesPerSec: number;
  activeInterfaces: number;
  status: MetricStatus;
  advice: ResourceAdvice;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  cpuPercent: number;
  memoryBytes: number;
  memoryPercent: number;
  path: string | null;
  startedAt: string | null;
  user: string | null;
}

export interface SystemHealthSummary {
  status: MetricStatus;
  headline: string;
  summary: string;
  actions: string[];
}

export interface SystemMetricsSnapshot {
  collectedAt: string;
  platform: PlatformKey;
  cpu: CpuMetrics;
  memory: MemoryMetrics;
  disk: DiskMetrics;
  network: NetworkMetrics;
  topProcesses: ProcessInfo[];
  health: SystemHealthSummary;
}

export type WatchdogCategory =
  | 'application'
  | 'system'
  | 'process'
  | 'network'
  | 'storage'
  | 'security';

export interface WatchdogEvent {
  id: string;
  timestamp: string;
  source: WatchdogSourceId;
  category: WatchdogCategory;
  severity: WatchdogSeverity;
  title: string;
  description: string;
  evidence: string[];
  recommendedAction: string;
}

export interface WatchdogEventQuery {
  limit?: number;
  severities?: WatchdogSeverity[];
  categories?: WatchdogCategory[];
  sources?: WatchdogSourceId[];
}

export interface StartupItem {
  name: string;
  command: string;
  location: string;
  enabled: boolean;
  publisher: string | null;
  user?: string | null;
}

export interface ScheduledTaskSummary {
  name: string;
  path: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  command?: string | null;
  state?: string | null;
}

export interface ServiceSummary {
  name: string;
  displayName: string;
  state: 'running' | 'stopped' | 'paused' | 'unknown';
  startMode: 'automatic' | 'manual' | 'disabled' | 'unknown';
}

export interface FixActionResult {
  actionId: string;
  success: boolean;
  timestamp: string;
  summary: string;
  details: string[];
}

export interface AppSettings {
  metricsRefreshIntervalMs: number;
  timelineEventLimit: number;
  theme: 'dark' | 'light' | 'system';
  enableTelemetrySummaries: boolean;
}
