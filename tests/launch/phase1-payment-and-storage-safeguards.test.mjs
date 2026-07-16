import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('staged onboarding files use authenticated AES-GCM encryption', async () => {
  const source = await read('src/lib/onboardingDb.ts');
  assert.match(source, /AES-GCM/);
  assert.match(source, /AES_GCM_IV_BYTES = 12/);
  assert.match(source, /tagLength: 128/);
  assert.match(source, /additionalData: textEncoder\.encode\(key\)/);
  assert.match(source, /sessionStorage\.setItem\(KEY_STORAGE_NAME/);
  assert.match(source, /stored instanceof Blob/);
  assert.match(source, /await stageFile\(key, legacyFile\)/);
  assert.doesNotMatch(source, /store\.put\(file, key\)/);
});

test('logout clears onboarding records and does not preserve the onboarding blob', async () => {
  const source = await read('src/components/PortalSessionControls.tsx');
  assert.match(source, /clearOnboardingSessionArtifacts/);
  assert.match(source, /await clearSessionAndPreserveLanguage\(\)/);
  assert.doesNotMatch(source, /activeOnboarding/);
  assert.doesNotMatch(source, /setItem\('bin-group-onboarding-v3'/);
});

test('payment instructions are server-authoritative and versioned', async () => {
  const server = await read('functions/paymentConfiguration.ts');
  const packageGate = await read('functions/secureOwnerRegistrationRequest.ts');
  const client = await read('src/components/onboarding/PaymentSummaryStep.tsx');
  const submission = await read('src/components/onboarding/PaymentSubmissionStep.tsx');
  const runtime = await read('functions/runtime.ts');

  assert.match(server, /system_payment_config/);
  assert.match(server, /EXPECTED_BENEFICIARY = "BIN GROUP L\.L\.C - S\.P\.C"/);
  assert.match(server, /\^AE\\d\{21\}\$/);
  assert.match(server, /configHash/);
  assert.match(packageGate, /assertCurrentPaymentConfiguration/);
  assert.match(packageGate, /submittedVersion !== activeConfiguration\.version/);
  assert.match(packageGate, /submittedHash !== activeConfiguration\.configHash/);
  assert.match(packageGate, /submitted bank-transfer instructions do not match/);
  assert.match(client, /getOwnerPaymentConfiguration/);
  assert.match(client, /configVersion: configuration\.version/);
  assert.match(client, /configHash: configuration\.configHash/);
  assert.doesNotMatch(client, /BIN GROUP \/ BIN Construction/);
  assert.match(submission, /verifiedPaymentManifest/);
  assert.match(submission, /paymentConfigVersion: paymentManifest\.configVersion/);
  assert.match(submission, /paymentConfigHash: paymentManifest\.configHash/);
  assert.match(submission, /reset\(\)/);
  assert.match(runtime, /export \* from "\.\/secureOwnerRegistrationRequest"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/ownerRegistrationRequest"/);
});

test('owner activation geo gate fails closed', async () => {
  const wrapper = await read('functions/securePaymentApproval.ts');
  const runtime = await read('functions/runtime.ts');

  assert.match(wrapper, /geo\.verified === true/);
  assert.match(wrapper, /geo\.dispatchReady === true/);
  assert.match(wrapper, /geo\.requiresGeoReview !== true/);
  assert.match(wrapper, /isFiniteCoordinate\(geo\.lat, -90, 90\)/);
  assert.match(wrapper, /isFiniteCoordinate\(geo\.lng, -180, 180\)/);
  assert.match(wrapper, /OWNER_ACTIVATION_GEO_GATE_BLOCKED/);
  assert.match(runtime, /export \* from "\.\/securePaymentApproval"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/paymentTransactionApproval"/);
});
