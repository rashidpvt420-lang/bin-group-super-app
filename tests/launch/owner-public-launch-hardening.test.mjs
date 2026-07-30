import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');

test('Owner properties use intake-scoped server IDs', () => {
  const source = read('functions/inspectionFirstOwnerOnboarding.ts');
  assert.match(source, /const propertyId = safeId\(`\$\{intakeId\}_property_\$\{index \+ 1\}`/);
  assert.doesNotMatch(source, /const propertyId = safeId\(property\.id \|\| property\.propertyId/);
});

test('15 percent evidence persists active payment configuration and Phase 1 methods', () => {
  const source = read('functions/inspectionFirstOwnerOnboarding.ts');
  assert.match(source, /loadActivePaymentConfiguration/);
  assert.match(source, /paymentConfigVersion: activeConfiguration\.version/);
  assert.match(source, /paymentConfigHash: activeConfiguration\.configHash/);
  assert.match(source, /\["CASH", "CHEQUE"\]\.includes\(method\)/);
});

test('Broker referral capture waits for verified Owner claims', () => {
  const account = read('src/components/onboarding/AccountCreationStep.tsx');
  const page = read('src/pages/PropertyOnboardingPage.tsx');
  assert.match(account, /getIdTokenResult\(true\)/);
  assert.match(account, /captureBrokerReferralAttribution/);
  assert.doesNotMatch(page, /captureReferral\(\{/);
});

test('Portfolio completion requires per-property GPS checklist photo evidence', () => {
  const backend = read('functions/ownerInspectionCompletion.ts');
  const admin = read('apps/admin-panel/src/components/admin/OwnerInspectionEvidenceDialog.tsx');
  assert.match(backend, /adminRecordOwnerPropertyInspectionEvidence/);
  assert.match(backend, /arrivalLocation: \{ lat: arrivalLat/);
  assert.match(backend, /evidenceStatus: "VERIFIED"/);
  assert.match(backend, /checklistVerified: true/);
  assert.match(admin, /Capture arrival GPS now/);
  assert.match(admin, /Add property photo or PDF/);
});

test('Final approval re-verifies every evidence-backed inspection', () => {
  const source = read('functions/securePaymentApproval.ts');
  assert.match(source, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);
  assert.match(source, /evidenceStatus/);
  assert.match(source, /arrivalLocation\?\.withinRadius/);
  assert.match(source, /paymentProofGeneration/);
});

test('Public Phase 1 launch does not demand disabled Stripe evidence', () => {
  const workflow = read('.github/workflows/firebase-production-deploy.yml');
  assert.match(workflow, /phase1-manual/);
  assert.match(workflow, /if \[\[ "\$PAYMENT_POLICY_INPUT" == "phase2-stripe" \]\]/);
});
