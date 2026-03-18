import os from 'node:os';

import type { WatchdogSeverity } from '@shared/models';

import { normalizePath } from './helpers';

const homeDirectory = normalizePath(os.homedir());

interface PathRule {
  id: 'temp' | 'downloads' | 'appdata';
  severity: WatchdogSeverity;
  matches: (candidate: string) => boolean;
  evidence: string;
  recommendedAction: string;
}

const PATH_RULES: PathRule[] = [
  {
    id: 'temp',
    severity: 'suspicious',
    matches: (candidate) =>
      candidate.includes('/appdata/local/temp/') ||
      candidate.includes('/temp/') ||
      candidate.includes('/tmp/') ||
      candidate.includes('/var/folders/'),
    evidence:
      'Executable path points into a temporary directory, which is a common staging area for short-lived installers and malware droppers.',
    recommendedAction:
      'Confirm that this launch was intentional before trusting the executable.'
  },
  {
    id: 'downloads',
    severity: 'unusual',
    matches: (candidate) =>
      candidate.includes('/downloads/') ||
      (homeDirectory ? candidate.startsWith(`${homeDirectory}/downloads/`) : false),
    evidence:
      'Executable path points into a Downloads folder, which often indicates a recently downloaded file.',
    recommendedAction:
      'Check whether the file was intentionally downloaded and launched by the user.'
  },
  {
    id: 'appdata',
    severity: 'unusual',
    matches: (candidate) =>
      candidate.includes('/appdata/local/') ||
      candidate.includes('/appdata/roaming/'),
    evidence:
      'Executable path points into AppData, a user-writable location that many installers use and some unwanted software abuses.',
    recommendedAction:
      'Validate that the program is expected, especially if it also persists at startup.'
  }
];

const SEVERITY_WEIGHT: Record<WatchdogSeverity, number> = {
  info: 0,
  unusual: 1,
  suspicious: 2
};

export interface PathAssessment {
  severity: WatchdogSeverity;
  reasons: string[];
  matchedRules: Array<PathRule['id']>;
  recommendedAction: string;
}

export const compareSeverity = (
  left: WatchdogSeverity,
  right: WatchdogSeverity
): number => SEVERITY_WEIGHT[left] - SEVERITY_WEIGHT[right];

export const maxSeverity = (
  ...severities: WatchdogSeverity[]
): WatchdogSeverity =>
  severities.reduce<WatchdogSeverity>((currentSeverity, nextSeverity) =>
    compareSeverity(nextSeverity, currentSeverity) > 0 ? nextSeverity : currentSeverity
  , 'info');

export const analyzeExecutablePath = (candidate: string | null): PathAssessment => {
  if (!candidate) {
    return {
      severity: 'info',
      matchedRules: [],
      reasons: ['Executable or command path was unavailable from the current user-space source.'],
      recommendedAction:
        'Use the event evidence and standard OS tools to inspect the launch if it looks unexpected.'
    };
  }

  const normalizedCandidate = normalizePath(candidate);
  const matchedRules = PATH_RULES.filter((rule) => rule.matches(normalizedCandidate));

  if (matchedRules.length === 0) {
    return {
      severity: 'info',
      matchedRules: [],
      reasons: ['Path did not match the current temp, Downloads, or AppData heuristics.'],
      recommendedAction:
        'Treat this as baseline activity unless the process name or timing still looks wrong.'
    };
  }

  const highestSeverityRule = [...matchedRules].sort((leftRule, rightRule) =>
    compareSeverity(rightRule.severity, leftRule.severity)
  )[0];

  return {
    severity: maxSeverity(...matchedRules.map((rule) => rule.severity)),
    matchedRules: matchedRules.map((rule) => rule.id),
    reasons: matchedRules.map((rule) => rule.evidence),
    recommendedAction: highestSeverityRule.recommendedAction
  };
};
