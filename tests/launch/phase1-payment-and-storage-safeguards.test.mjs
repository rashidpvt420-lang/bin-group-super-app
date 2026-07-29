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

test('legacy instructions stay server-authoritative while Phase 1 defers Cash/Cheque until verified visits', async () => {
  const server = await read('functions/paymentConfiguration.ts');
  const packageGate = await read('functions/secureOwnerRegistrationRequest.ts');
  const legacyClient = await read('src/components/onboarding/PaymentSummaryStep.tsx');
  const legacySubmission = await read('src/components/onboarding/PaymentSubmissionStep.tsx');
  const fivePageSubmission = await read('src/components/onboarding/InspectionSubmissionStep.tsx');
  const fivePageBackend = await read('functions/phase1OwnerLaunchRepair.ts');
  const visitBackend = await read('functions/phase1OwnerVisitEvidenceHardened.ts');
  const approvalBackend = await read('functions/securePaymentApproval.ts');
  const runtime = await read('functions/runtime.ts');
  const adminFirebase = await read('apps/admin-panel/src/lib/firebase.ts');

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
  assert.match(fivePageSubmission, /documentEvidence/);
  assert.doesNotMatch(fivePageSubmission, /getOwnerPaymentConfiguration|paymentManifest|createStripeCheckoutSession|downloadUrl|documentUrls/);
  assert.match(fivePageBackend, /NOT_DUE_UNTIL_INSPECTION_COMPLETE/);
  assert.match(fivePageBackend, /adminRecordOwnerMobilizationPaymentEvidencePhase1/);
  assert.match(fivePageBackend, /payment\.inspectionVerified !== true/);
  assert.match(fivePageBackend, /new Set\(\["CASH", "CHEQUE"\]\)/);
  assert.match(fivePageBackend, /paymentConfigVersion: configuration\.version/);
  assert.match(fivePageBackend, /paymentConfigHash: configuration\.configHash/);
  assert.match(fivePageBackend, /paymentManifest/);
  assert.doesNotMatch(fivePageBackend, /firebaseStorageDownloadTokens|alt=media&token=/);
  assert.match(visitBackend, /adminRecordOwnerPortfolioVisitEvidenceHardened/);
  assert.match(visitBackend, /MAX_ARRIVAL_DISTANCE_METRES = 250/);
  assert.match(visitBackend, /MAX_ARRIVAL_ACCURACY_METRES = 100/);
  assert.match(visitBackend, /MAX_GPS_CAPTURE_AGE_MS = 2 \* 60 \* 1000/);
  assert.match(visitBackend, /BROWSER_GEOLOCATION_AT_SUBMISSION/);
  assert.match(visitBackend, /gpsWithinRadius: true/);
  assert.match(visitBackend, /gpsAccuracyVerified: true/);
  assert.match(visitBackend, /gpsCaptureFresh: true/);
  assert.match(visitBackend, /checklistComplete: true/);
  assert.match(visitBackend, /photoCount: 1/);
  assert.match(adminFirebase, /captureFreshAdminBrowserGps/);
  assert.match(adminFirebase, /arrivalAccuracyMetres/);
  assert.match(adminFirebase, /positionCapturedAtMs/);
  assert.match(approvalBackend, /PHASE1_PRIVATE_RECEIPT_ADMIN_APPROVED/);
  assert.match(approvalBackend, /A verified Admin MFA session is required/);
  assert.match(runtime, /submitOwnerInspectionFirstOnboardingPhase1 as submitOwnerInspectionFirstOnboarding/);
  assert.match(runtime, /adminRecordOwnerMobilizationPaymentEvidencePhase1 as adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(runtime, /adminRecordOwnerPortfolioVisitEvidenceHardened as adminRecordOwnerPortfolioVisitEvidence/);
  assert.match(runtime, /adminCompleteOwnerPortfolioInspectionsPhase1Hardened as adminCompleteOwnerPortfolioInspections/);
  assert.match(runtime, /from "\.\/phase1OwnerLaunchRepair"/);
  assert.match(runtime, /from "\.\/phase1OwnerVisitEvidenceHardened"/);
  assert.doesNotMatch(runtime, /^export \* from "\.\/inspectionFirstOwnerOnboarding";/m);
  assert.doesNotMatch(runtime, /export \* from "\.\/ownerInspectionCompletion"/);
  assert.match(runtime, /export \* from "\.\/ownerInspectionAdminLink"/);
  assert.match(runtime, /export \* from "\.\/secureOwnerRegistrationRequest"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/ownerRegistrationRequest"/);
});

test('owner activation geo and evidence gates fail closed', async () => {
  const wrapper = await read('functions/securePaymentApproval.ts');
  const runtime = await read('functions/runtime.ts');

  assert.match(wrapper, /geo\.verified === true/);
  assert.match(wrapper, /geo\.dispatchReady === true/);
  assert.match(wrapper, /geo\.requiresGeoReview !== true/);
  assert.match(wrapper, /isFiniteCoordinate\(geo\.lat, -90, 90\)/);
  assert.match(wrapper, /isFiniteCoordinate\(geo\.lng, -180, 180\)/);
  assert.match(wrapper, /OWNER_ACTIVATION_GEO_GATE_BLOCKED/);
  assert.match(wrapper, /inspectionEvidenceVerifiedCount/);
  assert.match(wrapper, /gpsWithinRadius !== true/);
  assert.match(wrapper, /checklistComplete !== true/);
  assert.match(wrapper, /Stored payment receipt evidence failed its integrity check/);
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
