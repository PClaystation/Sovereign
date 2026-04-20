import type { FileTrustInfo } from '@shared/models';

import { buildKey, normalizePath } from './helpers';
import {
  escapePowerShellString,
  runPowerShellJson
} from './windows/runPowerShell';

interface RawFileTrustRow {
  Path?: string;
  Exists?: boolean;
  Publisher?: string;
  CompanyName?: string;
  ProductName?: string;
  SignatureStatus?: string;
  Error?: string;
}

interface CacheEntry {
  info: FileTrustInfo;
  cachedAt: number;
}

const CACHE_TTL_MS = 10 * 60_000;

const toSignatureStatus = (
  value: string | undefined,
  exists: boolean,
  hasError: boolean
): FileTrustInfo['signatureStatus'] => {
  if (!exists) {
    return 'missing';
  }

  const normalizedValue = value?.trim().toLowerCase();
  if (normalizedValue === 'valid') {
    return 'trusted';
  }

  if (normalizedValue === 'notsigned') {
    return 'unsigned';
  }

  if (normalizedValue) {
    return 'invalid';
  }

  return hasError ? 'error' : 'unknown';
};

const buildFileTrustCommand = (paths: string[]): string => {
  const literals = paths.map((value) => escapePowerShellString(value)).join(', ');

  return `
$paths = @(${literals})
$results = foreach ($item in $paths) {
  $exists = Test-Path -LiteralPath $item
  $signature = $null
  $versionInfo = $null
  $publisher = $null
  $errorMessage = $null

  if ($exists) {
    try {
      $signature = Get-AuthenticodeSignature -LiteralPath $item -ErrorAction Stop
      if ($signature.SignerCertificate) {
        $publisher = $signature.SignerCertificate.Subject
      }
    } catch {
      $errorMessage = $_.Exception.Message
    }

    try {
      $versionInfo = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($item)
    } catch {
      if (-not $errorMessage) {
        $errorMessage = $_.Exception.Message
      }
    }
  }

  [PSCustomObject]@{
    Path = $item
    Exists = $exists
    Publisher = $publisher
    CompanyName = if ($versionInfo) { $versionInfo.CompanyName } else { $null }
    ProductName = if ($versionInfo) { $versionInfo.ProductName } else { $null }
    SignatureStatus = if ($signature) { $signature.Status.ToString() } else { $null }
    Error = $errorMessage
  }
}

$results | ConvertTo-Json -Depth 5 -Compress
`;
};

export class FileTrustProvider {
  private readonly cache = new Map<string, CacheEntry>();

  async read(path: string | null | undefined): Promise<FileTrustInfo | null> {
    if (!path?.trim()) {
      return null;
    }

    const normalizedPath = normalizePath(path);
    const cachedEntry = this.cache.get(normalizedPath);

    if (cachedEntry && Date.now() - cachedEntry.cachedAt < CACHE_TTL_MS) {
      return cachedEntry.info;
    }

    const records = await this.readMany([path]);
    return records.get(normalizedPath) || null;
  }

  async readMany(paths: Array<string | null | undefined>): Promise<Map<string, FileTrustInfo>> {
    const normalizedPathEntries = paths
      .filter((value): value is string => Boolean(value?.trim()))
      .map((value) => [normalizePath(value), value.trim()] as const)
      .filter(([normalizedValue]) => normalizedValue.length > 0)
      .filter(
        ([normalizedValue], index, values) =>
          values.findIndex(([candidate]) => candidate === normalizedValue) === index
      );
    const result = new Map<string, FileTrustInfo>();

    if (normalizedPathEntries.length === 0) {
      return result;
    }

    const freshPaths: string[] = [];

    for (const [normalizedPath, rawPath] of normalizedPathEntries) {
      const cachedEntry = this.cache.get(normalizedPath);

      if (cachedEntry && Date.now() - cachedEntry.cachedAt < CACHE_TTL_MS) {
        result.set(normalizedPath, cachedEntry.info);
        continue;
      }

      freshPaths.push(rawPath);
    }

    if (freshPaths.length === 0) {
      return result;
    }

    if (process.platform !== 'win32') {
      for (const rawPath of freshPaths) {
        const info: FileTrustInfo = {
          path: rawPath,
          exists: false,
          publisher: null,
          companyName: null,
          productName: null,
          signatureStatus: 'unknown',
          error: 'File trust inspection is only available on Windows.',
          verifiedAt: new Date().toISOString()
        };
        const normalizedPath = normalizePath(rawPath);
        result.set(normalizedPath, info);
        this.cache.set(normalizedPath, { info, cachedAt: Date.now() });
      }

      return result;
    }

    const rawRows = await runPowerShellJson<RawFileTrustRow>(buildFileTrustCommand(freshPaths));
    const rowsByPath = new Map(
      rawRows.map((row) => [buildKey(normalizePath(row.Path)), row] as const)
    );

    for (const rawPath of freshPaths) {
      const row = rowsByPath.get(buildKey(normalizePath(rawPath)));
      const exists = Boolean(row?.Exists);
      const info: FileTrustInfo = {
        path: rawPath,
        exists,
        publisher: row?.Publisher?.trim() || null,
        companyName: row?.CompanyName?.trim() || null,
        productName: row?.ProductName?.trim() || null,
        signatureStatus: toSignatureStatus(
          row?.SignatureStatus,
          exists,
          Boolean(row?.Error)
        ),
        error: row?.Error?.trim() || null,
        verifiedAt: new Date().toISOString()
      };
      const normalizedPath = normalizePath(rawPath);

      result.set(normalizedPath, info);
      this.cache.set(normalizedPath, { info, cachedAt: Date.now() });
    }

    return result;
  }
}
