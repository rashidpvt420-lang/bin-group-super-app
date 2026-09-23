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

test('five-page browser recovery persists only non-secret application state', async () => {
  const store = await read('src/store/onboardingStore.ts');
  assert.match(store, /OWNER_PAGE_COUNT = 5/);
  assert.match(store, /version: 5/);
  const persistenceBlock = store.slice(store.indexOf('partialize:'));
  for (const required of [
    'companyProfile: state.companyProfile',
    'ownerAccount: state.ownerAccount',
    'properties: state.properties',
    'proofDocuments: state.proofDocuments',
    'signatureName: state.signatureName',
  ]) assert.match(persistenceBlock, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const forbidden of [
    'signupData: state.signupData',
    'password',
    'kycUrls: state.kycUrls',
    'paymentManifest: state.paymentManifest',
    'paymentMethod: state.paymentMethod',
    'paymentReceipt',
  ]) assert.doesNotMatch(persistenceBlock, new RegExp(forbidden));
});

test('legacy payment instructions remain server-authoritative while five-page acquisition defers payment until inspection', async () => {
  const server = await read('functions/paymentConfiguration.ts');
  const packageGate = await read('functions/secureOwnerRegistrationRequest.ts');
  const legacyClient = await read('src/components/onboarding/PaymentSummaryStep.tsx');
  const legacySubmission = await read('src/components/onboarding/PaymentSubmissionStep.tsx');
  const fivePageSubmission = await read('src/components/onboarding/InspectionSubmissionStep.tsx');
  const fivePageBackend = await read('functions/inspectionFirstOwnerOnboarding.ts');
  const runtime = await read('functions/runtime.ts');

  assert.match(server, /system_payment_config/);
  assert.match(server, /EXPECTED_BENEFICIARY = "BIN GROUP L\.L\.C - S\.P\.C"/);
  assert.match(server, /\^AE\\d\{21\}\$/);
  assert.match(server, /configHash/);
  assert.match(packageGate, /assertCurrentPaymentConfiguration/);
  assert.match(packageGate, /submittedVersion !== activeConfiguration\.version/);
  assert.match(packageGate, /submittedHash !== activeConfiguration\.configHash/);
  assert.match(packageGate, /submitted bank-transfer instructions do not match/);
  assert.match(legacyClient, /getOwnerPaymentConfiguration/);
  assert.match(legacyClient, /configVersion: configuration\.version/);
  assert.match(legacyClient, /configHash: configuration\.configHash/);
  assert.doesNotMatch(legacyClient, /BIN GROUP \/ BIN Construction/);
  assert.match(legacySubmission, /verifiedPaymentManifest/);
  assert.match(legacySubmission, /paymentConfigVersion: paymentManifest\.configVersion/);
  assert.match(legacySubmission, /paymentConfigHash: paymentManifest\.configHash/);

  assert.match(fivePageSubmission, /submitOwnerInspectionFirstOnboarding/);
  assert.match(fivePageSubmission, /No payment is collected now/);
  assert.doesNotMatch(fivePageSubmission, /getOwnerPaymentConfiguration|paymentManifest|createStripeCheckoutSession/);
  assert.match(fivePageBackend, /NOT_DUE_UNTIL_INSPECTION_COMPLETE/);
  assert.match(fivePageBackend, /adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(fivePageBackend, /inspectionVerified !== true/);
  assert.match(runtime, /submitOwnerInspectionFirstOnboarding/);
  assert.match(runtime, /adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(runtime, /from "\.\/inspectionFirstOwnerOnboarding"/);
  assert.doesNotMatch(runtime, /^export \* from "\.\/inspectionFirstOwnerOnboarding";/m);
  assert.match(runtime, /export \* from "\.\/ownerInspectionAdminLink"/);
  assert.match(runtime, /export \* from "\.\/ownerInspectionCompletion"/);
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

test('owner account page precedes property details and OCR', async () => {
  const page = await read('src/pages/PropertyOnboardingPage.tsx');
  const clientMachine = await read('src/lib/onboardingStateMachine.ts');
  const serverMachine = await read('functions/onboardingStateMachine.ts');

  const accountPage = page.indexOf("safePage === 1");
  const accountStep = page.indexOf('<AccountCreationStep');
  const propertyPage = page.indexOf("safePage === 2");
  const assetStep = page.indexOf('<AssetProfileStep');
  assert.ok(accountPage >= 0 && accountStep > accountPage, 'Page 1 must include Owner account creation.');
  assert.ok(propertyPage > accountPage && assetStep > propertyPage, 'Property details and OCR must follow the Owner account page.');
  for (const machine of [clientMachine, serverMachine]) {
    assert.match(machine, /'account_created'/);
    assert.match(machine, /draft: \['account_created', 'expired', 'suspended'\]/);
    assert.match(machine, /account_created: \['property_details_complete'/);
  }
});

test('title-deed OCR applies verified values only and never fabricates property data', async () => {
  const assetStep = await read('src/components/onboarding/AssetProfileStep.tsx');
  assert.match(assetStep, /const verifiedOcrPatch/);
  assert.match(assetStep, /if \(!Object\.keys\(patch\)\.length\)/);
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
  assert.match(runtime, /submitBrokerKycProfile,\s*getBrokerKycProfileSummary/);
  assert.match(runtime, /from "\.\/secureBrokerKycSubmission"/);
  assert.match(page, /submitBrokerKycProfile/);
  assert.match(page, /getBrokerKycProfileSummary/);
  assert.doesNotMatch(page, /broker_kyc_profiles/);
  assert.doesNotMatch(page, /setDoc\(doc\(db, ['"]users['"]/);
  assert.match(ruleHardener, /allow create, update, delete: if false/);
  assert.match(ruleHardener, /sensitiveBrokerFields/);
  assert.match(packageJson, /harden:broker-kyc-rules/);
});
