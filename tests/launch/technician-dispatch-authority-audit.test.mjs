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

test('credential-renewal evidence is server-written and excluded from global browser writes', async () => {
  const [backend, hardening] = await Promise.all([
    read('functions/secureTechnicianProfileOperations.ts'),
    read('scripts/optimize-current-main-technician-ticket-rule.mjs'),
  ]);
  assert.match(backend, /technician_credential_renewals/);
  assert.match(backend, /sha256/);
  assert.match(backend, /PENDING_ADMIN_REVIEW/);
  assert.match(hardening, /match \/technician_credential_renewals\/\{requestId\}/);
  assert.match(hardening, /allow create, update, delete: if false/);
  assert.match(hardening, /technician_credential_renewals/);
  assert.match(hardening, /excluded from global Admin write fallback/);
});
