import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeExecutablePath } from './rules';

test('flags temp paths as suspicious with high confidence', () => {
  const assessment = analyzeExecutablePath(
    'C:\\Users\\operator\\AppData\\Local\\Temp\\installer.exe'
  );

  assert.equal(assessment.severity, 'suspicious');
  assert.equal(assessment.confidence, 'high');
  assert.ok(assessment.labels.includes('Temp path'));
  assert.ok(assessment.whyThisMatters.length > 0);
});

test('treats downloads paths as unusual', () => {
  const assessment = analyzeExecutablePath('C:\\Users\\operator\\Downloads\\tool.exe');

  assert.equal(assessment.severity, 'unusual');
  assert.equal(assessment.confidence, 'medium');
  assert.ok(assessment.labels.includes('Downloads path'));
});

test('returns an informational assessment for normal program files paths', () => {
  const assessment = analyzeExecutablePath('C:\\Program Files\\Vendor\\App\\app.exe');

  assert.equal(assessment.severity, 'info');
  assert.equal(assessment.confidence, 'low');
  assert.equal(assessment.labels.length, 0);
});
