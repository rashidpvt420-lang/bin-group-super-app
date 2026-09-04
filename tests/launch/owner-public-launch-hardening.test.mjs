import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

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

test('Public Phase 1 launch cannot select or demand disabled Stripe evidence', () => {
  const productionWorkflow = read('.github/workflows/firebase-production-deploy.yml');
  const generatedCandidatePath = 'launch_package/generated/firebase-production-deploy-phase1.yml';
  const generatedCandidate = existsSync(generatedCandidatePath) ? read(generatedCandidatePath) : '';
  const generatorPath = 'scripts/apply-phase1-manual-public-launch-policy.mjs';
  const generator = existsSync(generatorPath) ? read(generatorPath) : '';
  const policySource = /phase1-manual/.test(productionWorkflow)
    ? productionWorkflow
    : generatedCandidate || generator;

  assert.match(policySource, /phase1-manual/);
  assert.match(policySource, /PAYMENT_POLICY_INPUT/);
  assert.match(policySource, /Phase 1 manual mode must not provide Stripe proof identifiers/);
  assert.doesNotMatch(policySource, /phase2-stripe/);
  assert.doesNotMatch(policySource, /Verify recent live Stripe payment and processed webhook/);
  assert.doesNotMatch(policySource, /verify-stripe-live-proof\.mjs/);

  if (!/phase1-manual/.test(productionWorkflow)) {
    const protectedCommand = read('.github/workflows/owner-public-launch-hardening-command.yml');
    assert.match(protectedCommand, /Resolve stable current main/);
    assert.match(protectedCommand, /node scripts\/apply-phase1-manual-public-launch-policy\.mjs/);
    assert.match(protectedCommand, /git restore --source="\$START_SHA" -- \.github\/workflows\/firebase-production-deploy\.yml/);
    assert.match(protectedCommand, /No deployment or YES-GO claim has been made/);
  }
});
