import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('protected business evidence separates exact Phase 1 payment policy from Founder geo authority', () => {
  const runner = read('scripts/run-protected-business-evidence.mjs');
  const ownerRunner = read('scripts/run-owner-business-suite-evidence.mjs');
  const payment = read('scripts/ensure-phase1-manual-payment-config.mjs');
  const preparer = read('scripts/prepare-protected-business-fixtures.mjs');
  assert.ok(runner.includes("run('scripts/ensure-phase1-manual-payment-config.mjs'"));
  assert.ok(runner.includes("run('scripts/prepare-protected-business-fixtures.mjs'"));
  assert.ok(ownerRunner.includes("run('scripts/ensure-phase1-manual-payment-config.mjs')"));
  assert.ok(ownerRunner.includes("run('scripts/prepare-protected-business-fixtures.mjs')"));
  assert.ok(payment.includes("approvedMethods: EXPECTED_METHODS"));
  assert.ok(payment.includes('bankTransferEnabled: false'));
  assert.ok(payment.includes('stripeEnabled: false'));
  assert.ok(preparer.includes("process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy'"));
  assert.ok(preparer.includes("process.env.GITHUB_REF !== 'refs/heads/main'"));
  assert.ok(preparer.includes("E2E_PROPERTY_ID = 'e2e-live-role-property'"));
  assert.ok(preparer.includes('admin.auth().getUserByEmail(founderEmail)'));
  assert.ok(preparer.includes('verifiedBy: founder.uid'));
  assert.ok(preparer.includes("source: 'FOUNDER_MFA_REVIEW'"));
  assert.ok(preparer.includes('hardLaunchClaim: false'));
  assert.ok(!preparer.includes('property.ownerUid || property.ownerId'));
});

test('Phase 1 callable requires bank routing only when Bank Transfer is enabled', () => {
  const source = read('functions/paymentConfiguration.ts');
  assert.ok(source.includes('const bankTransferEnabled = approvedMethods.includes("BANK_TRANSFER")'));
  assert.ok(source.includes('if (bankTransferEnabled)'));
  assert.ok(source.includes('bankName: bankTransferEnabled ? rawBankName : ""'));
  assert.ok(source.includes('Cash and Cheque payments require an approved BIN GROUP office location.'));
});

test('unified production app activates the Firebase Messaging worker and retries the real-token registration path', () => {
  assert.equal(existsSync('public/firebase-messaging-sw.js'), true);
  const worker = read('public/firebase-messaging-sw.js');
  const service = read('src/services/pushNotificationService.ts');
  assert.ok(worker.includes("projectId: 'bin-group-57c60'"));
  assert.ok(worker.includes("appId: '1:123413252227:web:285cb53bc26626d699f3b6'"));
  assert.ok(service.includes("navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })"));
  assert.ok(service.includes('PUSH_REGISTRATION_ATTEMPTS = 4'));
  assert.ok(service.includes('getToken(messaging'));
  assert.ok(service.includes("httpsCallable(functions, 'registerPushToken')"));
  assert.ok(service.includes('registration_failed:'));
  assert.ok(!worker.includes('owner-app-id'));
});
