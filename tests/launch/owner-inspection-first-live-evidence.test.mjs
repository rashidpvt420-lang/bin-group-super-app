import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patchOwnerEvidenceWorkflow } from '../../scripts/apply-owner-inspection-first-evidence-workflow.mjs';

const read = (file) => readFileSync(file, 'utf8');

test('Owner live evidence executes the five-page inspection-first production lifecycle', () => {
  const source = read('scripts/run-owner-inspection-first-production-evidence.mjs');
  for (const callable of [
    'previewOwnerInspectionQuote',
    'requestOwnerInspectionSignatureOtp',
    'verifyOwnerInspectionSignatureOtp',
    'uploadOwnerInspectionProofDocument',
    'submitOwnerInspectionFirstOnboarding',
    'adminCreateOwnerPortfolioPropertyInspection',
    'adminLinkOwnerPropertyInspection',
    'adminRecordOwnerPropertyInspectionEvidence',
    'adminCompleteOwnerPortfolioInspections',
    'adminRecordOwnerMobilizationPaymentEvidence',
    'adminApprovePayment',
  ]) {
    assert.ok(source.includes(`'${callable}'`), `missing production callable ${callable}`);
  }
  for (const retired of [
    'previewOwnerOnboardingQuote',
    'submitOwnerOnboardingPaymentPackage',
    "method: 'BANK_TRANSFER'",
    "paymentMethod: 'BANK_TRANSFER'",
    'for (let number = 0; number <= 999999; number += 1)',
    'retrieveContractSignatureOtpForTestEvidence',
  ]) {
    assert.ok(!source.includes(retired), `retired or unsafe Owner evidence path remains: ${retired}`);
  }
  assert.ok(source.includes('signInWithRequiredTotpMfa'));
  assert.ok(source.includes('HMAC_SHA256_OWNER_INSPECTION_V1'));
  assert.ok(source.includes('readGmailOtp'));
  assert.ok(source.includes("approvedMethods) === JSON.stringify(['CASH', 'CHEQUE'])"));
  assert.ok(source.includes('`${intakeId}_property_1`'));
  assert.ok(source.includes('paymentNotDueBeforeInspections: true'));
  assert.ok(source.includes('sensitiveValuesExcluded: true'));
});

test('Owner evidence artifact excludes bank account and identity secrets', () => {
  const source = read('scripts/run-owner-inspection-first-production-evidence.mjs');
  const evidenceStart = source.indexOf('  const evidence = {');
  const evidenceEnd = source.indexOf('\n  mkdirSync(', evidenceStart);
  assert.ok(evidenceStart >= 0 && evidenceEnd > evidenceStart, 'evidence object must be present');
  const evidenceBlock = source.slice(evidenceStart, evidenceEnd);
  for (const forbidden of ['accountNumber', 'iban', 'swiftBic', 'founderPassword', 'founderTotpSecret', 'otp:']) {
    assert.ok(!evidenceBlock.includes(forbidden), `evidence object leaks ${forbidden}`);
  }
});

test('Owner Playwright business proof requires server IDs, genuine visits, Phase 1 receipt and Founder MFA', () => {
  const runner = read('scripts/run-owner-business-suite-evidence.mjs');
  const spec = read('tests/e2e/business-owner.spec.ts');
  assert.ok(runner.includes('run-owner-inspection-first-production-evidence.mjs'));
  assert.ok(!runner.includes('run-owner-onboarding-production-evidence-secure.mjs'));
  for (const required of [
    'serverGeneratedPropertyIds',
    'inspectionEvidence',
    'arrivalWithinRadius',
    'paymentConfigHash',
    "method: 'CASH'",
    "mfaSecondFactorType: 'totp'",
    'E2E_FOUNDER_TOTP_SECRET',
  ]) {
    assert.ok(spec.includes(required), `Owner business spec is missing ${required}`);
  }
});

test('production workflow patch binds Founder TOTP evidence to bank-pilot and public evidence jobs', () => {
  for (const file of [
    '.github/workflows/firebase-production-deploy.yml',
    'launch_package/generated/firebase-production-deploy-phase1.yml',
  ]) {
    const source = read(file);
    const patched = patchOwnerEvidenceWorkflow(source, file);
    assert.equal(patched.split('E2E_FOUNDER_EMAIL: ${{ secrets.E2E_FOUNDER_EMAIL }}').length - 1, 2);
    assert.equal(patched.split('E2E_FOUNDER_PASSWORD: ${{ secrets.E2E_FOUNDER_PASSWORD }}').length - 1, 2);
    assert.equal(patched.split('E2E_FOUNDER_TOTP_SECRET: ${{ secrets.E2E_FOUNDER_TOTP_SECRET }}').length - 1, 2);
    assert.equal(patched.split("E2E_REQUIRE_FOUNDER_MFA: 'true'").length - 1, 2);
    assert.equal(patchOwnerEvidenceWorkflow(patched, file), patched, 'workflow patch must be idempotent');
  }
});
