import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
const fixture = readFileSync('scripts/prepare-protected-business-fixtures.mjs', 'utf8');
const tenant = readFileSync('tests/e2e/business-tenant.spec.ts', 'utf8');
const technician = readFileSync('tests/e2e/business-technician.spec.ts', 'utf8');
const jobDetail = readFileSync('src/technician/pages/TechnicianJobDetailPage.tsx', 'utf8');

test('merged Founder MFA workflow wiring remains present in both production jobs', () => {
  const expected = [
    'E2E_FOUNDER_EMAIL: ${{ inputs.founder_email }}',
    'E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}',
    'E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}',
  ];
  for (const binding of expected) assert.equal(workflow.split(binding).length - 1, 2, binding);
});

test('protected fixture makes the Technician callable-ready before Tenant handoff', () => {
  for (const field of ['currentShiftId', 'deviceRegistered', 'medicalCardStatus', 'drivingLicenseStatus', 'certificationsStatus', 'certifications', 'lastGpsAt', 'maxConcurrentJobs']) {
    assert.ok(fixture.includes(field), field);
  }
  assert.ok(fixture.includes('protectedFiveRoleEvidenceReady: true'));
});

test('Tenant and Technician evidence prove persisted lifecycle state without stale ticket assumptions', () => {
  assert.ok(tenant.includes('Technician Start Trip must persist canonical ON_THE_WAY in production Firestore.'));
  assert.ok(technician.includes("toBe('ON_THE_WAY')"));
  assert.ok(technician.includes('EVIDENCE_RUN_KEY'));
  assert.ok(technician.includes('let lifecycleStatus'));
  assert.ok(technician.includes("lifecycleStatus === 'ACCEPTED'"));
  assert.ok(technician.includes("lifecycleStatus === 'ON_THE_WAY'"));
  assert.ok(technician.includes('accepted.acceptedAt'));
});

test('online callable rejections are visible and are not disguised as offline queue success', () => {
  assert.ok(jobDetail.includes('isRetryableNetworkError'));
  assert.ok(jobDetail.includes('Mission acceptance was rejected by production controls.'));
  assert.ok(jobDetail.includes('Production rejected the'));
});
