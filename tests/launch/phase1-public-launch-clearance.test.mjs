import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const repair = read('functions/phase1OwnerLaunchRepair.ts');
const visits = read('functions/ownerInspectionEvidence.ts');
const approval = read('functions/securePaymentApproval.ts');
const runtime = read('functions/runtime.ts');
const account = read('src/components/onboarding/AccountCreationStep.tsx');
const submission = read('src/components/onboarding/InspectionSubmissionStep.tsx');
const intakeAdmin = read('apps/admin-panel/src/pages/admin/IntakeVaultPage.tsx');
const paymentsAdmin = read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
const cleanAppCheck = read('tests/e2e/production-clean-browser-appcheck.spec.ts');

test('Owner property documents remain private and immutable', () => {
  assert.match(repair, /accessClass:\s*"ADMIN_SIGNED_URL_ONLY"/);
  assert.match(repair, /cacheControl:\s*"private, no-store, max-age=0"/);
  assert.match(repair, /crypto\.createHash\("sha256"\)/);
  assert.match(repair, /const generation = text\(metadata\.generation\)/);
  assert.doesNotMatch(repair, /firebaseStorageDownloadTokens/);
  assert.doesNotMatch(repair, /alt=media&token=/);
  assert.match(repair, /adminCreateOwnerDocumentAccessUrl/);
  assert.match(repair, /Date\.now\(\) \+ 10 \* 60 \* 1000/);
});

test('canonical property records are intake scoped and cannot overwrite another Owner', () => {
  assert.match(repair, /function canonicalPropertyId\(intakeId: string, index: number\)/);
  assert.match(repair, /`\$\{intakeId\}_property_\$\{index \+ 1\}`/);
  assert.match(repair, /clientDraftId:/);
  assert.match(repair, /transaction\.create\(db\.collection\("properties"\)\.doc\(property\.propertyId\)/);
  assert.doesNotMatch(repair, /const propertyId = safeId\(property\.id \|\| property\.propertyId/);
});

test('Phase 1 payment is exact, configuration-bound and Cash or Cheque only', () => {
  assert.match(repair, /const PHASE1_PAYMENT_METHODS = new Set\(\["CASH", "CHEQUE"\]\)/);
  assert.match(repair, /loadActivePaymentConfiguration\(\)/);
  assert.match(repair, /paymentConfigVersion: configuration\.version/);
  assert.match(repair, /paymentConfigHash: configuration\.configHash/);
  assert.match(repair, /paymentManifest/);
  assert.match(repair, /Math\.abs\(amountReceived - expectedAmount\) > 0\.01/);
  assert.doesNotMatch(paymentsAdmin, /BANK_TRANSFER/);
  assert.doesNotMatch(paymentsAdmin, /STRIPE/);
  assert.match(paymentsAdmin, /const PHASE1_METHODS = \['CASH', 'CHEQUE'\]/);
  assert.match(paymentsAdmin, /Locked amount:/);
});

test('Admin final approval requires MFA, verified visit evidence and receipt integrity', () => {
  assert.match(approval, /A verified Admin MFA session is required/);
  assert.match(approval, /inspectionEvidenceVerifiedCount/);
  assert.match(approval, /gpsWithinRadius !== true/);
  assert.match(approval, /checklistComplete !== true/);
  assert.match(approval, /photoCount \|\| 0\) < 1/);
  assert.match(approval, /Stored payment receipt evidence failed its integrity check/);
  assert.match(approval, /PHASE1_PAYMENT_METHODS/);
});

test('every property visit requires genuine GPS checklist timestamps findings and photo evidence', () => {
  for (const key of ['accessVerified', 'exteriorReviewed', 'utilitiesReviewed', 'safetyReviewed', 'occupancyConfirmed']) {
    assert.ok(visits.includes(`"${key}"`), `missing checklist control ${key}`);
  }
  assert.match(visits, /MAX_ARRIVAL_DISTANCE_METRES = 750/);
  assert.match(visits, /durationMs < 60_000 \|\| durationMs > 12 \* 60 \* 60 \* 1000/);
  assert.match(visits, /Visit photo is empty or exceeds 6 MB/);
  assert.match(visits, /evidenceVerified: true/);
  assert.match(visits, /adminCompleteOwnerPortfolioInspectionsPhase1/);
  assert.match(intakeAdmin, /Use current device GPS/);
  assert.match(intakeAdmin, /Attach current property photo/);
  assert.match(intakeAdmin, /Complete verified visits & request 15%/);
  assert.doesNotMatch(intakeAdmin, /COMPLETE ALL VISITS/);
});

test('Broker capture waits until verified Owner claims are ready', () => {
  const upsertIndex = account.indexOf("await upsertProfile({");
  const tokenIndex = account.indexOf("const tokenResult = await currentUser.getIdTokenResult(true)");
  const ownerReadyIndex = account.indexOf("setOwnerAccount({");
  assert.ok(upsertIndex >= 0 && tokenIndex > upsertIndex && ownerReadyIndex > tokenIndex);
  assert.match(account, /tokenRole\(tokenResult\.claims/);
  assert.doesNotMatch(account.slice(0, account.indexOf('const confirmEmailVerification')), /setOwnerAccount\(/);
});

test('runtime deploys only repaired submission payment and visit completion handlers', () => {
  assert.match(runtime, /uploadOwnerInspectionProofDocumentPhase1 as uploadOwnerInspectionProofDocument/);
  assert.match(runtime, /submitOwnerInspectionFirstOnboardingPhase1 as submitOwnerInspectionFirstOnboarding/);
  assert.match(runtime, /adminRecordOwnerMobilizationPaymentEvidencePhase1 as adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(runtime, /adminCompleteOwnerPortfolioInspectionsPhase1 as adminCompleteOwnerPortfolioInspections/);
  assert.doesNotMatch(runtime, /export \* from "\.\/ownerInspectionCompletion"/);
  assert.doesNotMatch(runtime, /adminCompleteOwnerPropertyInspection,/);
});

test('Owner page five sends protected evidence rather than permanent URLs', () => {
  assert.match(submission, /documentEvidence/);
  assert.match(submission, /uploaded\.storagePath/);
  assert.match(submission, /uploaded\.sha256/);
  assert.match(submission, /uploaded\.generation/);
  assert.doesNotMatch(submission, /documentUrls/);
  assert.doesNotMatch(submission, /downloadUrl/);
});

test('clean-browser App Check evidence explicitly forbids debug-token injection', () => {
  assert.match(cleanAppCheck, /delete \(globalThis as any\)\.FIREBASE_APPCHECK_DEBUG_TOKEN/);
  assert.match(cleanAppCheck, /debugTokenPresent/);
  assert.match(cleanAppCheck, /toBe\(false\)/);
  assert.match(cleanAppCheck, /ReCaptchaV3Provider/);
  assert.match(cleanAppCheck, /verifyProductionAppCheckAttestation/);
});
