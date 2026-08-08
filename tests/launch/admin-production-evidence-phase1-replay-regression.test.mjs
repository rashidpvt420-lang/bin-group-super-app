import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('standalone Admin Production Evidence applies the protected Phase 1 replay repair before real MFA evidence', () => {
  const workflow = read('.github/workflows/admin-production-evidence.yml');
  const patchIndex = workflow.indexOf('node scripts/apply-five-role-business-evidence-fixes.mjs');
  const evidenceIndex = workflow.indexOf('node scripts/run-critical-evidence.mjs --suite adminCredentialLogin');

  assert.ok(patchIndex >= 0, 'standalone Admin evidence must apply the protected replay repair');
  assert.ok(evidenceIndex > patchIndex, 'replay repair must execute before the real Admin evidence suite');
  assert.ok(workflow.includes("if: github.ref == 'refs/heads/main'"));
  assert.ok(workflow.includes('environment: production'));
  assert.ok(workflow.includes('expected_commit_sha must equal the full current main SHA'));
  assert.ok(workflow.includes('production_deploy_run_id must be numeric'));
});
