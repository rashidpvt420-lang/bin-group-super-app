import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const inspectionLink = read('functions/ownerInspectionAdminLink.ts');
const inspectionCompletion = read('functions/ownerInspectionCompletion.ts');
const inspectionDialog = read('apps/admin-panel/src/components/admin/OwnerInspectionEvidenceDialog.tsx');
const proofUpload = read('src/components/onboarding/ProofUploadStep.tsx');
const finalSubmission = read('src/components/onboarding/InspectionSubmissionStep.tsx');
const serverQuote = read('functions/ownerOnboardingQuote.ts');

test('Gym inspections are bound to the Owner-declared Gym profile before the visit', () => {
  assert.match(inspectionLink, /propertyType/);
  assert.match(inspectionLink, /gymProfileSnapshot/);
  assert.match(inspectionLink, /gymVerificationRequired:\s*isGym/);
  assert.match(inspectionLink, /ownerDeclaredGymServiceAreaSqft/);
  assert.match(inspectionLink, /paymentCollectionRequired:\s*false/);
});

test('Admin Gym evidence requires verified measured area and verified complexity', () => {
  assert.match(inspectionCompletion, /verifiedServiceAreaSqft/);
  assert.match(inspectionCompletion, /verifiedComplexity/);
  assert.match(inspectionCompletion, /STANDARD_DRY/);
  assert.match(inspectionCompletion, /ENHANCED/);
  assert.match(inspectionCompletion, /WET_RECOVERY/);
  assert.match(inspectionCompletion, /gymVerificationStatus:\s*"VERIFIED"/);
  assert.match(inspectionCompletion, /source:\s*"ADMIN_SITE_VISIT"/);
  assert.match(inspectionDialog, /Verified measured service area \(sq ft\)/);
  assert.match(inspectionDialog, /Verified complexity/);
  assert.match(inspectionDialog, /gymVerification:\s*draft\.gymVerification/);
  assert.match(inspectionDialog, /Member count and equipment count remain scope information only/);
});

test('completion re-prices the entire portfolio from verified Gym facts before payment becomes due', () => {
  assert.match(inspectionCompletion, /const verifiedProperties = properties\.map/);
  assert.match(inspectionCompletion, /calculateOwnerOnboardingQuote\(verifiedProperties/);
  assert.match(inspectionCompletion, /finalVerifiedQuoteHash/);
  assert.match(inspectionCompletion, /finalVerifiedQuoteSnapshot/);
  assert.match(inspectionCompletion, /finalAnnualContractValue/);
  assert.match(inspectionCompletion, /finalActivationDeposit/);
  assert.match(inspectionCompletion, /quoteRepricedAfterInspection:\s*true/);
  assert.match(inspectionCompletion, /FINAL_VERIFIED_AFTER_ALL_SITE_VISITS/);
  assert.match(inspectionCompletion, /15_PERCENT_DUE_AFTER_COMPLETED_VISITS_AND_FINAL_REQUOTE/);
  assert.match(inspectionCompletion, /annualContractValue,\s*activationDeposit:\s*amount,\s*amount,/s);
});

test('signed pre-visit quote evidence is preserved instead of silently replacing the OTP-bound quote hash', () => {
  assert.match(inspectionCompletion, /signedPreInspectionQuoteHash/);
  assert.match(inspectionCompletion, /const signedQuoteHash = text\(intake\.quoteHash/);
  assert.doesNotMatch(inspectionCompletion, /batch\.set\(contractRef,[\s\S]{0,2000}quoteHash:\s*finalQuote\.quoteHash/);
  assert.doesNotMatch(inspectionCompletion, /batch\.set\(paymentRef,[\s\S]{0,2000}quoteHash:\s*finalQuote\.quoteHash/);
  assert.match(serverQuote, /quoteHash/);
});

test('verified Gym facts persist into canonical property and contract snapshots', () => {
  for (const token of [
    'verifiedServiceAreaSqft',
    'verifiedComplexity',
    'verifiedOpeningSchedule',
    'verifiedEquipmentCount',
    'verificationInspectionId',
    'verificationEvidenceHash',
  ]) assert.match(inspectionCompletion, new RegExp(token));
  assert.match(inspectionCompletion, /properties:\s*verifiedProperties/);
  assert.match(inspectionCompletion, /verifiedPropertyById/);
});

test('Gym compliance documents are staged, protected-uploaded and visible to Admin', () => {
  for (const key of ['gymSportsApproval', 'gymInsurance', 'gymFloorPlan']) {
    assert.match(proofUpload, new RegExp(key));
    assert.match(finalSubmission, new RegExp(key));
  }
  assert.match(proofUpload, /stageFile\(key, file\)/);
  assert.match(finalSubmission, /uploadOwnerInspectionProofDocument/);
  assert.match(finalSubmission, /docType:\s*document\.key/);
  assert.match(finalSubmission, /documentUrls/);
});

test('Owner-facing inspection-first copy states Gym verification and final server re-quote before payment', () => {
  assert.match(finalSubmission, /Gym area and complexity will be verified on site before the final payable quote is issued/);
  assert.match(finalSubmission, /final server re-quote/);
  assert.match(finalSubmission, /pre-visit 15% estimate/i);
  assert.match(inspectionDialog, /final re-quote & request 15%/i);
});
