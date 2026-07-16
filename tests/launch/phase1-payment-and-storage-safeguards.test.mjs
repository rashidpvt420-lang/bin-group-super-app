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

test('onboarding browser persistence contains only safe draft coordinates', async () => {
  const store = await read('src/store/onboardingStore.ts');
  assert.match(store, /version: 4/);
  assert.match(store, /partialize: \(state\) => \(\{\s*step: state\.step,\s*intakeId: state\.intakeId,?\s*\}\)/s);
  const persistenceBlock = store.slice(store.indexOf('partialize:'));
  for (const forbidden of ['signupData', 'password', 'kycUrls', 'paymentManifest', 'proofDocuments', 'signatureName', 'properties: state.properties']) {
    assert.doesNotMatch(persistenceBlock, new RegExp(forbidden));
  }
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

test('owner account creation precedes property upload and OCR', async () => {
  const page = await read('src/pages/PropertyOnboardingPage.tsx');
  const clientMachine = await read('src/lib/onboardingStateMachine.ts');
  const serverMachine = await read('functions/onboardingStateMachine.ts');

  assert.match(page, /case 2: return <AccountCreationStep/);
  assert.match(page, /case 3: return <AssetProfileStep/);
  assert.match(page, /Authentication is deliberately completed before title-deed upload\/OCR/);
  for (const machine of [clientMachine, serverMachine]) {
    assert.match(machine, /'account_created'/);
    assert.match(machine, /draft: \['account_created', 'expired', 'suspended'\]/);
    assert.match(machine, /account_created: \['property_details_complete'/);
  }
});

test('title-deed OCR applies verified values only and never fabricates property data', async () => {
  const assetStep = await read('src/components/onboarding/AssetProfileStep.tsx');
  assert.match(assetStep, /buildVerifiedOcrPatch/);
  assert.match(assetStep, /Object\.keys\(verifiedPatch\)\.length === 0/);
  assert.match(assetStep, /No placeholder values were added/);
  assert.doesNotMatch(assetStep, /extracted\.propertyType \|\| ['"]Apartment['"]/);
  assert.doesNotMatch(assetStep, /extracted\.sqft \|\| 1850/);
  assert.doesNotMatch(assetStep, /extracted\.emirate \|\| ['"]Dubai['"]/);
  assert.match(assetStep, /riskProfile: 'ASSESSMENT_REQUIRED'/);
  assert.doesNotMatch(assetStep, /maxWorshipperCapacity: 300/);
});

test('Broker KYC is written only through the App Check callable', async () => {
  const callable = await read('functions/brokerKycProfile.ts');
  const runtime = await read('functions/runtime.ts');
  const page = await read('src/broker/pages/BrokerProfilePage.tsx');
  const ruleHardener = await read('scripts/harden-broker-kyc-rules.mjs');
  const packageJson = await read('package.json');

  assert.match(callable, /export const submitBrokerKycProfile = onCall/);
  assert.match(callable, /enforceAppCheck: true/);
  assert.match(callable, /broker_kyc_profiles/);
  assert.match(callable, /broker_kyc_submission_limits/);
  assert.match(callable, /submissionHash/);
  assert.match(runtime, /export \* from "\.\/brokerKycProfile"/);
  assert.match(page, /submitBrokerKycProfile/);
  assert.match(page, /broker_kyc_profiles/);
  assert.doesNotMatch(page, /setDoc\(doc\(db, ['"]users['"]/);
  assert.match(ruleHardener, /allow create, update, delete: if false/);
  assert.match(ruleHardener, /sensitiveBrokerFields/);
  assert.match(packageJson, /harden:broker-kyc-rules/);
});
