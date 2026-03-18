const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: 'auto'
});

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    BYTE_UNITS.length - 1
  );
  const value = bytes / 1024 ** unitIndex;
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(digits)} ${BYTE_UNITS[unitIndex]}`;
};

export const formatRate = (bytesPerSecond: number): string =>
  `${formatBytes(bytesPerSecond)}/s`;

export const formatPercentage = (value: number): string => `${Math.round(value)}%`;

export const formatClock = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

export const formatRelativeTime = (timestamp: string | null): string => {
  if (!timestamp) {
    return 'Unavailable';
  }

  const deltaMs = new Date(timestamp).getTime() - Date.now();
  const deltaMinutes = Math.round(deltaMs / 60_000);

  if (Math.abs(deltaMinutes) < 1) {
    return 'just now';
  }

  if (Math.abs(deltaMinutes) < 60) {
    return relativeTimeFormatter.format(deltaMinutes, 'minute');
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (Math.abs(deltaHours) < 24) {
    return relativeTimeFormatter.format(deltaHours, 'hour');
  }

  const deltaDays = Math.round(deltaHours / 24);
  return relativeTimeFormatter.format(deltaDays, 'day');
};
