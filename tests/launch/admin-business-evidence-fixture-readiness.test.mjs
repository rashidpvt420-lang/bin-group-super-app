import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const adminEvidence = readFileSync('tests/e2e/business-admin.spec.ts', 'utf8');
const assignment = readFileSync('functions/secureAdminTechnicianAssignment.ts', 'utf8');

test('protected Admin evidence activates only its synthetic technician fixture before dispatch', () => {
  const start = adminEvidence.indexOf('async function patchTechnicianReadiness');
  const end = adminEvidence.indexOf('\nfunction payoutCard', start);
  assert.ok(start >= 0 && end > start, 'Admin evidence readiness helper must exist.');
  const helper = adminEvidence.slice(start, end);

  assert.match(helper, /status:\s*'ACTIVE'/);
  assert.match(helper, /suspended:\s*false/);
  assert.match(helper, /onboardingComplete:\s*true/);
  assert.match(helper, /onboardingStage:\s*'ACTIVE'/);
  assert.match(helper, /collection\('staffAccess'\)\.doc\(uid\)\.set/);
  assert.match(helper, /active:\s*true/);
  assert.match(helper, /setCustomUserClaims\(uid/);
});

test('production technician assignment remains fail-closed for suspended accounts', () => {
  assert.match(assignment, /profile\.suspended\s*===\s*true/);
  assert.match(assignment, /Technician dispatch readiness failed/);
  assert.doesNotMatch(assignment, /e2eRunId|E2E|test fixture/i);
});
