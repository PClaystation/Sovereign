import assert from 'node:assert/strict';
import test from 'node:test';

import type { LaunchdDefinition } from '@main/platform/macos/launchd';

import {
  shouldIncludeLaunchdDefinitionAsScheduledTask,
  toMacosScheduledTaskRecord
} from './macosScheduledTaskProvider';

const createDefinition = (
  overrides: Partial<LaunchdDefinition> = {}
): LaunchdDefinition => ({
  label: 'com.continental.agent',
  plistPath: '/Users/operator/Library/LaunchAgents/com.continental.agent.plist',
  location: '~/Library/LaunchAgents',
  user: 'operator',
  domainTarget: 'gui/501',
  command: '/Applications/Sovereign.app/Contents/MacOS/Sovereign --scan',
  enabled: true,
  loaded: true,
  running: false,
  runAtLoad: false,
  keepAlive: false,
  hasSchedule: true,
  scheduleSummary: 'interval:300s',
  kind: 'launch-agent',
  ...overrides
});

test('includes macOS launchd definitions with scheduled triggers', () => {
  assert.equal(
    shouldIncludeLaunchdDefinitionAsScheduledTask(createDefinition({ hasSchedule: true })),
    true
  );
  assert.equal(
    shouldIncludeLaunchdDefinitionAsScheduledTask(createDefinition({ hasSchedule: false })),
    false
  );
});

test('maps a scheduled launchd definition into a scheduled task record', () => {
  const record = toMacosScheduledTaskRecord(createDefinition({ running: true }));

  assert.deepEqual(record, {
    name: 'com.continental.agent',
    path: '~/Library/LaunchAgents/',
    enabled: true,
    lastRunAt: null,
    nextRunAt: null,
    command: '/Applications/Sovereign.app/Contents/MacOS/Sovereign --scan',
    state: 'running · interval:300s'
  });
});
