import path from 'node:path';
import { access } from 'node:fs/promises';

import type { FileTrustInfo } from '@shared/models';

import { buildKey, normalizePath } from './helpers';
import {
  escapePowerShellString,
  runPowerShellJson
} from './windows/runPowerShell';
import { runMacosTextCommand } from '@main/platform/macos/runMacosCommand';

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

const fileExists = async (candidatePath: string): Promise<boolean> => {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
};

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

const findMacosMetadataValue = (
  output: string,
  prefix: string
): string | null => {
  const line = output
    .split('\n')
    .find((candidate) => candidate.trim().startsWith(prefix));

  if (!line) {
    return null;
  }

  const value = line.slice(line.indexOf(prefix) + prefix.length).trim();
  return value || null;
};

const parseMacosPublisher = (codesignOutput: string): string | null =>
  findMacosMetadataValue(codesignOutput, 'Authority=');

const parseMacosCompanyName = (publisher: string | null): string | null => {
  if (!publisher) {
    return null;
  }

  const developerIdMatch = publisher.match(/^Developer ID Application:\s+(.+?)\s+\([A-Z0-9]+\)$/);
  if (developerIdMatch) {
    return developerIdMatch[1].trim();
  }

  return publisher;
};

const parseMacosProductName = (
  candidatePath: string,
  codesignOutput: string
): string | null =>
  findMacosMetadataValue(codesignOutput, 'Identifier=') || path.basename(candidatePath);

const toMacosSignatureStatus = (
  codesignOutput: string,
  spctlOutput: string
): FileTrustInfo['signatureStatus'] => {
  const combinedOutput = `${codesignOutput}\n${spctlOutput}`.toLowerCase();

  if (
    combinedOutput.includes('not signed at all') ||
    combinedOutput.includes('code object is not signed at all') ||
    combinedOutput.includes('no usable signature')
  ) {
    return 'unsigned';
  }

  if (combinedOutput.includes('accepted')) {
    return 'trusted';
  }

  if (
    combinedOutput.includes('rejected') ||
    combinedOutput.includes('invalid') ||
    combinedOutput.includes('a sealed resource is missing or invalid')
  ) {
    return 'invalid';
  }

  return combinedOutput.trim() ? 'unknown' : 'error';
};

const readMacosFileTrust = async (candidatePath: string): Promise<FileTrustInfo> => {
  const exists = await fileExists(candidatePath);
  const verifiedAt = new Date().toISOString();

  if (!exists) {
    return {
      path: candidatePath,
      exists: false,
      publisher: null,
      companyName: null,
      productName: null,
      signatureStatus: 'missing',
      error: null,
      verifiedAt
    };
  }

  const [codesignOutput, spctlOutput] = await Promise.all([
    runMacosTextCommand('codesign', ['-dv', '--verbose=4', candidatePath], {
      allowNonZeroExit: true
    }),
    runMacosTextCommand('spctl', ['-a', '-vv', '--type', 'exec', candidatePath], {
      allowNonZeroExit: true
    })
  ]);
  const publisher = parseMacosPublisher(codesignOutput);
  const signatureStatus = toMacosSignatureStatus(codesignOutput, spctlOutput);
  const combinedOutput = `${codesignOutput}\n${spctlOutput}`.trim();
  const error =
    signatureStatus === 'error'
      ? combinedOutput || 'macOS code-signing metadata was unreadable.'
      : null;

  return {
    path: candidatePath,
    exists: true,
    publisher,
    companyName: parseMacosCompanyName(publisher),
    productName: parseMacosProductName(candidatePath, codesignOutput),
    signatureStatus,
    error,
    verifiedAt
  };
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

    if (process.platform === 'darwin') {
      const macosInfos = await Promise.all(
        freshPaths.map(async (rawPath) => [rawPath, await readMacosFileTrust(rawPath)] as const)
      );

      for (const [rawPath, info] of macosInfos) {
        const normalizedPath = normalizePath(rawPath);
        result.set(normalizedPath, info);
        this.cache.set(normalizedPath, { info, cachedAt: Date.now() });
      }

      return result;
    }

    if (process.platform !== 'win32') {
      for (const rawPath of freshPaths) {
        const info: FileTrustInfo = {
          path: rawPath,
          exists: await fileExists(rawPath),
          publisher: null,
          companyName: null,
          productName: null,
          signatureStatus: 'unknown',
          error: 'File trust inspection is not implemented for this platform.',
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
