import fs from 'node:fs';
import assert from 'node:assert/strict';

const lifecycle = fs.readFileSync(new URL('../../scripts/run-owner-onboarding-production-evidence.mjs', import.meta.url), 'utf8');
const wrapper = fs.readFileSync(new URL('../../scripts/run-owner-business-suite-evidence.mjs', import.meta.url), 'utf8');
const ownerSpec = fs.readFileSync(new URL('../e2e/business-owner.spec.ts', import.meta.url), 'utf8');
const mailTrigger = fs.readFileSync(new URL('../../functions/ownerOnboardingLifecycleEmail.ts', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../../functions/runtime.ts', import.meta.url), 'utf8');

const lifecycleContracts = [
  "callFunction('submitPendingOwnerRegistration'",
  "callFunction('getOwnerPaymentConfiguration'",
  "callFunction('uploadOwnerOnboardingProofDocument'",
  "callFunction('previewOwnerOnboardingQuote'",
  "callFunction('requestContractSignatureOtp'",
  "callFunction('verifyContractSignatureOtp'",
  "callFunction('submitOwnerOnboardingPaymentPackage'",
  "callFunction('adminRejectPayment'",
  "callFunction('adminApprovePayment'",
  'payment-references/owners/${ownerSession.uid}/${intakeId}/',
  "activationDeposit === Math.round(initialQuote.annualContractValue * 0.15)",
  "duplicateSubmission.success === true && duplicateSubmission.idempotent === true",
  "duplicateApproval.status === 'SUCCESS' && duplicateApproval.idempotent === true",
  "previousQuoteHashes.includes(initialQuote.quoteHash)",
  "invoiceCount.size === 1",
  "waitForMailDelivery(`owner_invoice_${intakeId}_${invoiceId}`",
  "owner-onboarding-production-evidence.json",
  "hardLaunchClaim: false",
];

for (const token of lifecycleContracts) {
  assert.ok(lifecycle.includes(token), `Owner production lifecycle proof is missing: ${token}`);
}

assert.ok(lifecycle.includes("documentTypes: ['propertyProof', 'emiratesId', 'passport']"), 'Owner evidence must cover property and individual identity documents');
assert.ok(lifecycle.includes("initialReceipt.receiptHash !== resubmissionReceipt.receiptHash"), 'Owner resubmission must rotate immutable receipt evidence');
assert.ok(!lifecycle.includes('E2E_OWNER_OTP'), 'Owner production proof must not rely on a plaintext OTP secret');
assert.ok(!lifecycle.includes('hardLaunchClaim: true'), 'Owner evidence cannot claim hard-launch approval');

assert.ok(wrapper.includes("run('scripts/run-owner-onboarding-production-evidence.mjs')"), 'Owner suite wrapper must execute acquisition evidence');
assert.ok(wrapper.includes("run('scripts/seed-live-role-test-data.mjs')"), 'Owner suite wrapper must restore shared live-role fixtures');
assert.ok(ownerSpec.includes("scripts/run-owner-business-suite-evidence.mjs"), 'Owner Playwright suite must execute the production lifecycle wrapper');
assert.ok(ownerSpec.includes("testInfo.attach('owner-onboarding-production-evidence'"), 'Owner Playwright suite must attach execution-generated evidence');
assert.ok(ownerSpec.includes("adminRejectionProven: true"), 'Owner Playwright suite must require rejection evidence');
assert.ok(ownerSpec.includes("approvalIdempotentReplay: true"), 'Owner Playwright suite must require idempotent approval evidence');

for (const token of [
  'owner_onboarding_submission_delivery',
  'owner_signed_contract_delivery',
  'owner_payment_rejection_delivery',
  'owner_mobilization_invoice_delivery',
  'requiresProviderDeliveryProof: true',
  'onOwnerOnboardingPaymentCreatedEmails',
  'onOwnerOnboardingPaymentLifecycleUpdated',
]) {
  assert.ok(mailTrigger.includes(token), `Owner lifecycle delivery is missing: ${token}`);
}

assert.ok(runtime.includes('export * from "./ownerOnboardingLifecycleEmail";'), 'Owner lifecycle email triggers must be deployed through the Functions runtime');

console.log('owner onboarding production proof launch regression: PASS');
