import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('provider evidence is finalized into the canonical hard-launch schema', async () => {
  const [workflow, finalizer, validator] = await Promise.all([
    read('.github/workflows/operational-provider-evidence.yml'),
    read('scripts/finalize-operational-provider-evidence.mjs'),
    read('scripts/lib/hard-launch-gate.mjs'),
  ]);

  assert.match(workflow, /Publish canonical operational provider evidence[\s\S]*Finalize provider evidence for hard-launch validation/);
  assert.match(workflow, /node scripts\/finalize-operational-provider-evidence\.mjs/);

  for (const gate of ['brandedEmailDelivery', 'stripeLiveBilling', 'appCheckEnforcement']) {
    assert.match(finalizer, new RegExp(`${gate}:\\s*'`));
    assert.match(finalizer, new RegExp(`#\\$\\{gate\\}`));
  }

  assert.match(finalizer, /evidenceReference:\s*`https:\/\/github\.com\/\$\{EXPECTED_REPOSITORY\}\/actions\/runs\/\$\{runId\}#\$\{gate\}`/);
  assert.match(finalizer, /githubRepository:\s*EXPECTED_REPOSITORY/);
  assert.match(finalizer, /verifiedBy:\s*'workflow'/);
  assert.match(finalizer, /sourceWorkflowRunId/);
  assert.match(finalizer, /workflowRunId/);
  assert.match(finalizer, /Canonical provider record read-back verification failed/);

  assert.match(validator, /evidenceReference must be an HTTPS URL on an approved evidence host/);
  assert.match(validator, /githubRepository mismatch/);
  assert.match(validator, /brandedEmailDelivery:\s*new Set\(\['provider-console-export', 'workflow-artifact'\]\)/);
});
