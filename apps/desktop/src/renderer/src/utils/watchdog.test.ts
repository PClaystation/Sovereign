import test from 'node:test';
import assert from 'node:assert/strict';

import type { WatchdogEvent, WatchdogSuppressionRule } from '@shared/models';

import { findMatchingSuppression } from './watchdog';

const baseEvent: WatchdogEvent = {
  id: 'event-1',
  timestamp: '2026-04-20T08:00:00.000Z',
  source: 'process-launch',
  category: 'process',
  severity: 'unusual',
  kind: 'incident',
  confidence: 'medium',
  title: 'Updater launched from AppData path',
  description: 'A new process launch matched an explainable path heuristic.',
  rationale: 'The executable path matched the AppData path heuristic.',
  whyThisMatters: 'AppData is user-writable and commonly used by installers and updaters.',
  evidence: ['Path: C:\\Users\\operator\\AppData\\Roaming\\Vendor\\updater.exe'],
  recommendedAction: 'Confirm that this launch was expected.',
  fingerprint: 'process|vendor-updater',
  correlationKey: 'path|c:/users/operator/appdata/roaming/vendor/updater.exe',
  subjectName: 'Vendor Updater',
  subjectPath: 'C:\\Users\\operator\\AppData\\Roaming\\Vendor\\updater.exe',
  firstSeenAt: '2026-04-20T08:00:00.000Z',
  lastSeenAt: '2026-04-20T08:00:00.000Z',
  occurrenceCount: 1,
  relatedEventCount: 0,
  pathSignals: ['AppData path'],
  fileTrust: null
};

test('matches path suppressions against normalized subject paths', () => {
  const suppressions: WatchdogSuppressionRule[] = [
    {
      id: 'suppression-1',
      kind: 'path',
      value: 'c:/users/operator/appdata/roaming/vendor/updater.exe',
      label: 'Vendor updater',
      source: 'process-launch',
      createdAt: '2026-04-20T08:05:00.000Z'
    }
  ];

  assert.equal(findMatchingSuppression(baseEvent, suppressions)?.id, 'suppression-1');
});

test('matches fingerprint suppressions when no path suppression exists', () => {
  const suppressions: WatchdogSuppressionRule[] = [
    {
      id: 'suppression-2',
      kind: 'fingerprint',
      value: 'process|vendor-updater',
      label: 'Vendor updater fingerprint',
      source: 'any',
      createdAt: '2026-04-20T08:05:00.000Z'
    }
  ];

  assert.equal(findMatchingSuppression(baseEvent, suppressions)?.id, 'suppression-2');
});

test('does not match suppressions from unrelated sources', () => {
  const suppressions: WatchdogSuppressionRule[] = [
    {
      id: 'suppression-3',
      kind: 'path',
      value: 'c:/users/operator/appdata/roaming/vendor/updater.exe',
      label: 'Scheduled task only',
      source: 'scheduled-tasks',
      createdAt: '2026-04-20T08:05:00.000Z'
    }
  ];

  assert.equal(findMatchingSuppression(baseEvent, suppressions), null);
});
