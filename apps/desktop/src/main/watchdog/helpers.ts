export const toArray = <Value>(value: Value | Value[] | null | undefined): Value[] => {
  if (value == null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

export const buildKey = (
  ...parts: Array<string | number | boolean | null | undefined>
): string =>
  parts
    .map((part) => String(part ?? '').trim().toLowerCase())
    .join('|');

export const normalizePath = (candidate: string | null | undefined): string =>
  (candidate || '').replace(/\\/g, '/').toLowerCase();

export const extractCommandPath = (command: string | null | undefined): string | null => {
  if (!command) {
    return null;
  }

  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return null;
  }

  if (trimmedCommand.startsWith('"')) {
    const closingQuote = trimmedCommand.indexOf('"', 1);
    return closingQuote > 1
      ? trimmedCommand.slice(1, closingQuote)
      : trimmedCommand.slice(1);
  }

  const executableMatch = trimmedCommand.match(
    /^[^\s]+\.(exe|cmd|bat|ps1|vbs|js|msi)/i
  );

  if (executableMatch) {
    return executableMatch[0];
  }

  return trimmedCommand.split(/\s+/)[0] || null;
};

export const normalizeTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsedValue = new Date(value);
  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue.toISOString();
};

export const parseJsonArray = <Value>(raw: string): Value[] => {
  if (!raw.trim()) {
    return [];
  }

  const parsedValue = JSON.parse(raw) as Value | Value[];
  return toArray(parsedValue);
};
