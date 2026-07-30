import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  patchTenantBusinessEvidence,
  patchTechnicianBusinessEvidence,
} from '../../scripts/apply-five-role-business-evidence-fixes.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('merged Phase 1 payment loader keeps bank authority conditional', () => {
  const loader = read('functions/paymentConfiguration.ts');
  const ensure = read('scripts/ensure-phase1-manual-payment-config.mjs');
  const proof = read('scripts/verify-phase1-manual-payment-proof.mjs');
  assert.ok(loader.includes('const bankTransferEnabled = approvedMethods.includes("BANK_TRANSFER")'));
  assert.ok(loader.includes('const cashOrChequeEnabled = approvedMethods.some'));
  assert.ok(loader.includes('if (bankTransferEnabled) {'));
  assert.ok(loader.includes('bankName: bankTransferEnabled ? rawBankName : ""'));
  assert.ok(ensure.includes('approvedMethods: EXPECTED_METHODS'));
  assert.ok(ensure.includes('bankTransferEnabled: false'));
  assert.ok(ensure.includes('stripeEnabled: false'));
  assert.ok(ensure.includes('BIN GROUP Headquarters, Al Ain, UAE (appointment required)'));
  assert.ok(proof.includes("const EXPECTED_METHODS = ['CASH', 'CHEQUE']"));
  assert.ok(proof.includes(".replace(/^sha256:/, '')"));
  assert.ok(!proof.includes('Corporate payment configuration is incomplete or invalid.'));
});

test('protected runner prepares exact policy and Founder geography before five-role evidence', () => {
  const runner = read('scripts/run-protected-business-evidence.mjs');
  assert.ok(runner.includes("process.env.GITHUB_WORKFLOW === 'Firebase Production Deploy'"));
  assert.ok(runner.includes("run('scripts/apply-five-role-business-evidence-fixes.mjs')"));
  assert.ok(runner.includes("run('scripts/ensure-phase1-manual-payment-config.mjs'"));
  assert.ok(runner.includes("run('scripts/prepare-protected-business-fixtures.mjs'"));
  assert.ok(runner.includes("run('scripts/verify-phase1-manual-payment-proof.mjs'"));
  assert.ok(runner.indexOf('prepare-protected-business-fixtures.mjs') < runner.indexOf("'scripts/run-critical-evidence.mjs'"));
});

test('Owner restoration preserves inspection-first lifecycle and re-applies downstream authority', () => {
  const ownerRunner = read('scripts/run-owner-business-suite-evidence.mjs');
  assert.ok(ownerRunner.includes("run('scripts/run-owner-inspection-first-production-evidence.mjs')"));
  assert.ok(!ownerRunner.includes('run-owner-onboarding-production-evidence-secure.mjs'));
  const seedIndex = ownerRunner.indexOf("run('scripts/seed-live-role-test-data.mjs')");
  const paymentIndex = ownerRunner.indexOf("run('scripts/ensure-phase1-manual-payment-config.mjs')");
  const geoIndex = ownerRunner.indexOf("run('scripts/prepare-protected-business-fixtures.mjs')");
  assert.ok(seedIndex >= 0 && seedIndex < paymentIndex && paymentIndex < geoIndex);
});

test('Founder-MFA geography uses the canonical Founder UID and matching timestamps', () => {
  const source = read('scripts/prepare-protected-business-fixtures.mjs');
  for (const required of [
    "process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy'",
    "process.env.GITHUB_REF !== 'refs/heads/main'",
    "E2E_PROPERTY_ID = 'e2e-live-role-property'",
    'admin.auth().getUserByEmail(founderEmail)',
    "source: 'admin_manual'",
    "source: 'FOUNDER_MFA_REVIEW'",
    'verifiedBy: founder.uid',
    'dispatchReady: true',
    'requiresGeoReview: false',
    'verificationVersion: 1',
    'geoMs !== verificationMs',
    'hardLaunchClaim: false',
  ]) assert.ok(source.includes(required), `missing geography control: ${required}`);
  assert.ok(!source.includes('property.ownerUid || property.ownerId'));
});

test('Tenant proof waits for the real callable and binds the exact returned ticket ID', () => {
  const source = read('tests/e2e/business-tenant.spec.ts');
  const patched = patchTenantBusinessEvidence(source);
  assert.ok(patched.includes("response.url().includes('createTenantServiceTicket')"));
  assert.ok(patched.includes('callablePayload?.result?.ticketId'));
  assert.ok(patched.includes("db.collection('maintenanceTickets').doc(ticketId).get()"));
  assert.ok(!patched.includes("where('description', '==', description)"));
  assert.equal(patchTenantBusinessEvidence(patched), patched);
});

test('Technician evidence uses real push success or explicit server no-token state without synthetic authority', () => {
  const source = read('tests/e2e/business-technician.spec.ts');
  const patched = patchTechnicianBusinessEvidence(source);
  assert.ok(patched.includes('registeredPushReady ? /SUCCESS|PARTIAL/ : /NO_REGISTERED_TOKEN/'));
  assert.ok(patched.includes("pushDeliveryState: 'NO_REGISTERED_TOKEN'"));
  assert.ok(patched.includes("where('recipientId', '==', technicianUid)"));
  assert.ok(!patched.includes('A current production FCM token must be registered before dispatch.'));
  for (const forbidden of ['fake-fcm', 'synthetic-token', 'registerPushToken({ token:', 'testPushToken']) {
    assert.ok(!patched.includes(forbidden), `synthetic push authority is forbidden: ${forbidden}`);
  }
  assert.equal(patchTechnicianBusinessEvidence(patched), patched);
});

test('production app retains real Messaging worker activation and bounded registration retries', () => {
  const service = read('src/services/pushNotificationService.ts');
  assert.ok(service.includes("navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })"));
  assert.ok(service.includes('PUSH_REGISTRATION_ATTEMPTS = 4'));
  assert.ok(service.includes('SERVICE_WORKER_ACTIVATION_TIMEOUT_MS = 20_000'));
  assert.ok(service.includes('getToken(messaging'));
  assert.ok(service.includes("httpsCallable(functions, 'registerPushToken')"));
  assert.ok(service.includes('registration_failed:'));
});

test('physical Technician GPS/device proof remains mandatory', () => {
  const hardGate = read('scripts/lib/hard-launch-gate.mjs');
  assert.ok(hardGate.includes("'technicianPhysicalGpsEvidence'"));
  assert.ok(hardGate.includes("technicianPhysicalGpsEvidence: new Set(['physical-device-report'])"));
  assert.ok(hardGate.includes('/physical.*device.*gps/i'));
});

test('generated Phase 1 workflow binds Founder MFA and Hosting retry remains fail-closed', () => {
  const generator = read('scripts/apply-phase1-manual-public-launch-policy.mjs');
  const verifier = read('scripts/verify-production-deployment.mjs');
  assert.ok(generator.includes('patchOwnerEvidenceWorkflow(workflow, workflowPath)'));
  assert.ok(generator.includes('E2E_FOUNDER_TOTP_SECRET'));
  assert.ok(verifier.includes('HOSTING_FETCH_ATTEMPTS = 6'));
  assert.ok(verifier.includes('AbortSignal.timeout(FETCH_TIMEOUT_MS)'));
  assert.ok(verifier.includes('isRetryableStatus'));
  assert.ok(verifier.includes('fetchProductionHostingText(site)'));
});
