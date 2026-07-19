import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Technician self-action and Admin assignment share mandatory operational readiness dimensions', async () => {
  const [selfGate, adminGate, runtime] = await Promise.all([
    read('functions/secureTechnicianOperations.ts'),
    read('functions/secureAdminTechnicianAssignment.ts'),
    read('functions/runtime.ts'),
  ]);
  for (const required of ['medical card', 'driving licence', 'required certifications', 'active shift', 'registered device', 'fresh GPS location', 'on-duty status', 'dispatch availability']) {
    assert.ok(selfGate.includes(required), `Technician self gate is missing ${required}`);
    assert.ok(adminGate.includes(required), `Admin assignment gate is missing ${required}`);
  }
  assert.match(selfGate, /getTechnicianOperationalReadiness/);
  assert.match(adminGate, /assignmentReadinessVersion:\s*"TECH_READINESS_V2"/);
  assert.match(adminGate, /failed-precondition/);
  assert.match(runtime, /adminAssignTechnician.*secureAdminTechnicianAssignment/);
});

test('renewal evidence collection is server-written and excluded from global browser writes', async () => {
  const [backend, hardening, finalAuthority, rules] = await Promise.all([
    read('functions/secureTechnicianProfileOperations.ts'),
    read('scripts/optimize-current-main-technician-ticket-rule.mjs'),
    read('scripts/harden-final-firestore-authority.mjs'),
    read('firestore.rules'),
  ]);
  assert.match(backend, /technician_credential_renewals/);
  assert.match(backend, /sha256/);
  assert.match(backend, /PENDING_ADMIN_REVIEW/);
  assert.match(hardening, /match \/technician_credential_renewals\/\{requestId\}/);
  assert.match(hardening, /allow create, update, delete: if false/);
  assert.match(hardening, /excluded from global Admin write fallback/);
  assert.match(hardening, /'technician_credential_renewals',\\n          'broker_kyc_profiles',\\n          'broker_kyc_submission_limits'/);
  assert.match(finalAuthority, /'broker_kyc_profiles',\\n          'broker_kyc_submission_limits',\\n          'ai_usage'/);

  const renewalBlocks = rules.match(/match \/technician_credential_renewals\/\{requestId\} \{[\s\S]*?\n    \}/g) || [];
  assert.equal(renewalBlocks.length, 1);
  assert.match(renewalBlocks[0], /allow read: if isAdmin\(\);/);
  assert.match(renewalBlocks[0], /allow create, update, delete: if false;/);
  assert.equal((rules.match(/'technician_credential_renewals',/g) || []).length, 2);
});
