import os from 'node:os';

import type { WatchdogConfidence, WatchdogSeverity } from '@shared/models';

import { normalizePath } from './helpers';

const homeDirectory = normalizePath(os.homedir());

interface PathRule {
  id: 'temp' | 'downloads' | 'appdata';
  label: string;
  severity: WatchdogSeverity;
  confidence: WatchdogConfidence;
  matches: (candidate: string) => boolean;
  evidence: string;
  whyThisMatters: string;
  recommendedAction: string;
}

const PATH_RULES: PathRule[] = [
  {
    id: 'temp',
    label: 'Temp path',
    severity: 'suspicious',
    confidence: 'high',
    matches: (candidate) =>
      candidate.includes('/appdata/local/temp/') ||
      candidate.includes('/temp/') ||
      candidate.includes('/tmp/') ||
      candidate.includes('/var/folders/'),
    evidence:
      'Executable path points into a temporary directory, which is a common staging area for short-lived installers and malware droppers.',
    whyThisMatters:
      'Processes launched from temporary locations deserve extra scrutiny because those paths are writable and often short-lived.',
    recommendedAction:
      'Confirm that this launch was intentional before trusting the executable.'
  },
  {
    id: 'downloads',
    label: 'Downloads path',
    severity: 'unusual',
    confidence: 'medium',
    matches: (candidate) =>
      candidate.includes('/downloads/') ||
      (homeDirectory ? candidate.startsWith(`${homeDirectory}/downloads/`) : false),
    evidence:
      'Executable path points into a Downloads folder, which often indicates a recently downloaded file.',
    whyThisMatters:
      'Launches from Downloads are often legitimate, but they usually represent software that has not been fully installed or moved into a standard program path yet.',
    recommendedAction:
      'Check whether the file was intentionally downloaded and launched by the user.'
  },
  {
    id: 'appdata',
    label: 'User app data path',
    severity: 'unusual',
    confidence: 'medium',
    matches: (candidate) =>
      candidate.includes('/appdata/local/') ||
      candidate.includes('/appdata/roaming/') ||
      candidate.includes('/library/application support/') ||
      candidate.includes('/library/containers/'),
    evidence:
      'Executable path points into a user application-data location, which many installers use and some unwanted software abuses.',
    whyThisMatters:
      'User application-data folders are heavily used by legitimate software, but they are also common places for persistence and user-space abuse because normal users can write there.',
    recommendedAction:
      'Validate that the program is expected, especially if it also persists at startup.'
  }
];

const SEVERITY_WEIGHT: Record<WatchdogSeverity, number> = {
  info: 0,
  unusual: 1,
  suspicious: 2
};

const CONFIDENCE_WEIGHT: Record<WatchdogConfidence, number> = {
  low: 0,
  medium: 1,
  high: 2
};

export interface PathAssessment {
  severity: WatchdogSeverity;
  confidence: WatchdogConfidence;
  reasons: string[];
  matchedRules: Array<PathRule['id']>;
  labels: string[];
  rationale: string;
  whyThisMatters: string;
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

export const maxConfidence = (
  ...confidences: WatchdogConfidence[]
): WatchdogConfidence =>
  confidences.reduce<WatchdogConfidence>(
    (currentConfidence, nextConfidence) =>
      CONFIDENCE_WEIGHT[nextConfidence] > CONFIDENCE_WEIGHT[currentConfidence]
        ? nextConfidence
        : currentConfidence,
    'low'
  );

export const analyzeExecutablePath = (candidate: string | null): PathAssessment => {
  if (!candidate) {
    return {
      severity: 'info',
      confidence: 'low',
      matchedRules: [],
      labels: [],
      reasons: ['Executable or command path was unavailable from the current user-space source.'],
      rationale:
        'Sovereign could not compare this item against its path heuristics because no executable path was available.',
      whyThisMatters:
        'Missing paths reduce certainty. The absence of a path is not suspicious by itself, but it limits automated triage.',
      recommendedAction:
        'Use the event evidence and standard OS tools to inspect the launch if it looks unexpected.'
    };
  }

  const normalizedCandidate = normalizePath(candidate);
  const matchedRules = PATH_RULES.filter((rule) => rule.matches(normalizedCandidate));

  if (matchedRules.length === 0) {
    return {
      severity: 'info',
      confidence: 'low',
      matchedRules: [],
      labels: [],
      reasons: ['Path did not match the current temp, Downloads, or AppData heuristics.'],
      rationale:
        'This path did not match Sovereign’s current user-writable path heuristics.',
      whyThisMatters:
        'No heuristic match means the path alone does not stand out, though other context can still matter.',
      recommendedAction:
        'Treat this as baseline activity unless the process name or timing still looks wrong.'
    };
  }

  const highestSeverityRule = [...matchedRules].sort((leftRule, rightRule) =>
    compareSeverity(rightRule.severity, leftRule.severity)
  )[0];

  return {
    severity: maxSeverity(...matchedRules.map((rule) => rule.severity)),
    confidence: maxConfidence(...matchedRules.map((rule) => rule.confidence)),
    matchedRules: matchedRules.map((rule) => rule.id),
    labels: matchedRules.map((rule) => rule.label),
    reasons: matchedRules.map((rule) => rule.evidence),
    rationale:
      matchedRules.length === 1
        ? `The path matched the ${matchedRules[0].label.toLowerCase()} heuristic.`
        : `The path matched multiple heuristics: ${matchedRules
            .map((rule) => rule.label)
            .join(', ')}.`,
    whyThisMatters: matchedRules
      .map((rule) => rule.whyThisMatters)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(' '),
    recommendedAction: highestSeverityRule.recommendedAction
  };
};
