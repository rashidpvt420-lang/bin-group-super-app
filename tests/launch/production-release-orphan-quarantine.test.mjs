import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isKnownOrphanedQueuedReleaseRun,
  selectActiveReleaseRuns,
} from '../../scripts/verify-production-release-merge-lock.mjs';

const workflowPath = 'firebase-production-dispatch-current-main.yml';
const ghost = {
  id: 31122180844,
  status: 'queued',
  head_sha: 'a1029b15f9ca33d7f3659390958d6030fcafda34',
};

test('exact immutable orphaned queued production dispatch is quarantined', () => {
  assert.equal(isKnownOrphanedQueuedReleaseRun(workflowPath, ghost), true);
  assert.deepEqual(selectActiveReleaseRuns(workflowPath, [ghost]), []);
});

test('same run fails closed if GitHub ever reports it in progress', () => {
  const active = { ...ghost, status: 'in_progress' };
  assert.equal(isKnownOrphanedQueuedReleaseRun(workflowPath, active), false);
  assert.equal(selectActiveReleaseRuns(workflowPath, [active]).length, 1);
});

test('quarantine cannot match a different workflow, run id, or SHA', () => {
  assert.equal(isKnownOrphanedQueuedReleaseRun('firebase-production-deploy.yml', ghost), false);
  assert.equal(isKnownOrphanedQueuedReleaseRun(workflowPath, { ...ghost, id: 31122180845 }), false);
  assert.equal(isKnownOrphanedQueuedReleaseRun(workflowPath, { ...ghost, head_sha: 'b'.repeat(40) }), false);
});
