import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowPath = new URL('../../.github/workflows/privileged-account-review-request.yml', import.meta.url);
const workflow = await readFile(workflowPath, 'utf8');

test('certificate request has separate announce and production export jobs', () => {
  assert.match(workflow, /announce_play_certificate:/);
  assert.match(workflow, /export_play_certificate:/);
  assert.match(workflow, /needs: announce_play_certificate/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /Publish waiting-for-production status/);
  assert.match(workflow, /Publish certificate extraction outcome/);
});

test('trusted workflow executes stable current main and never request code', () => {
  assert.match(workflow, /Resolve stable exact current main/);
  assert.match(workflow, /ref: \$\{\{ env\.RELEASE_SHA \}\}/);
  assert.match(workflow, /Verify main remained frozen before extraction/);
  assert.match(workflow, /Verify main remained frozen through extraction/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.head_ref \}\}/);
});

test('protected inputs are inspected without exposing values', () => {
  assert.match(workflow, /Inspect protected Android signing inputs/);
  assert.match(workflow, /missing_csv/);
  assert.match(workflow, /Missing protected Android signing inputs/);
  assert.match(workflow, /Protected signing inputs ready:/);
  assert.match(workflow, /Missing protected inputs:/);
  assert.doesNotMatch(workflow, /echo "\$ANDROID_UPLOAD_KEYSTORE_BASE64"/);
});

test('success closes request without merge and failure remains observable', () => {
  assert.match(workflow, /Status: \\`SUCCESS\\`/);
  assert.match(workflow, /Status: \\`FAILURE\\`/);
  assert.match(workflow, /issues\/\$TRACKING_ISSUE/);
  assert.match(workflow, /issues\/\$ISSUE_NUMBER/);
  assert.match(workflow, /pulls\/\$REQUEST_PR/);
  assert.match(workflow, /-f state='closed'/);
  assert.doesNotMatch(workflow, /merge_pull_request/);
});
