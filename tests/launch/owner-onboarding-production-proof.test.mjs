import fs from 'node:fs';
import assert from 'node:assert/strict';

const lifecycle = fs.readFileSync(new URL('../../scripts/run-owner-onboarding-production-evidence.mjs', import.meta.url), 'utf8');
const secureLifecycle = fs.readFileSync(new URL('../../scripts/run-owner-onboarding-production-evidence-secure.mjs', import.meta.url), 'utf8');
const gmailReader = fs.readFileSync(new URL('../../scripts/lib/gmail-otp-reader.mjs', import.meta.url), 'utf8');
const wrapper = fs.readFileSync(new URL('../../scripts/run-owner-business-suite-evidence.mjs', import.meta.url), 'utf8');
const ownerSpec = fs.readFileSync(new URL('../e2e/business-owner.spec.ts', import.meta.url), 'utf8');
const financials = fs.readFileSync(new URL('../../src/owner/pages/OwnerFinancialsPage.tsx', import.meta.url), 'utf8');
const otpSecurity = fs.readFileSync(new URL('../../functions/contractSignatureOtpMailbox.ts', import.meta.url), 'utf8');
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

assert.ok(lifecycle.includes("rejected.status === 'SUCCESS' && rejected.idempotent === false"), 'Owner evidence must assert the real admin rejection response contract');
assert.ok(lifecycle.includes("upper(rejectedPayment.verificationState) === 'ADMIN_REJECTED'"), 'Owner evidence must assert the locked rejection state');
assert.ok(lifecycle.includes("value.unlocksDashboard === true && value.paymentVerified === true"), 'Owner evidence must assert the production payment unlock flags');
assert.ok(lifecycle.includes("upper(value.activationStatus) === 'ACTIVE'"), 'Owner evidence must assert the production property activation state');
assert.ok(lifecycle.includes("documentTypes: ['propertyProof', 'emiratesId', 'passport']"), 'Owner evidence must cover property and individual identity documents');
assert.ok(lifecycle.includes("initialReceipt.receiptHash !== resubmissionReceipt.receiptHash"), 'Owner resubmission must rotate immutable receipt evidence');
assert.ok(!lifecycle.includes('E2E_OWNER_OTP'), 'Owner production proof must not rely on a plaintext OTP secret');
assert.ok(!lifecycle.includes('hardLaunchClaim: true'), 'Owner evidence cannot claim hard-launch approval');

for (const token of [
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'functions:secrets:access',
  "from './lib/gmail-otp-reader.mjs'",
  'expectedMailboxEmail: ownerMailboxEmail',
  'recipient: ownerEmail',
  "subject: 'BIN GROUP contract signature OTP'",
  'correlationId: requestId',
  'providerMessageId',
  'mailboxReceiptVerified: true',
  'mailboxMessageIdHash: receipt.messageIdHash',
  "value.testEvidence === undefined",
  'HMAC_SHA256_OWNER_CONTRACT_V1',
]) {
  assert.ok(secureLifecycle.includes(token), `Mailbox-authoritative Owner OTP evidence is missing: ${token}`);
}

const mailboxBlockStart = secureLifecycle.indexOf('const mailboxBlock =');
const mailboxBlockEnd = secureLifecycle.indexOf('source = `${source.slice', mailboxBlockStart);
assert.ok(mailboxBlockStart >= 0 && mailboxBlockEnd > mailboxBlockStart, 'Owner mailbox transformation block is missing');
const generatedMailboxBlock = secureLifecycle.slice(mailboxBlockStart, mailboxBlockEnd);
for (const forbidden of [
  "callFunction('retrieveContractSignatureOtpForTestEvidence'",
  'protected_test_callable',
  'for (let number = 0; number <= 999999; number += 1)',
  'beforeData.testEvidence',
]) {
  assert.ok(!generatedMailboxBlock.includes(forbidden), `Generated Owner mailbox evidence contains forbidden OTP bypass: ${forbidden}`);
}
assert.ok(secureLifecycle.includes('if (source.includes(forbidden))'), 'Owner wrapper must fail closed if a forbidden OTP bypass survives transformation');

for (const token of [
  'gmail.googleapis.com/gmail/v1/users/me/profile',
  'gmail.googleapis.com/gmail/v1/users/me/messages',
  'attachments/${encodeURIComponent(attachmentId)}',
  'matched multiple messages',
  'strict base64url',
]) {
  assert.ok(gmailReader.includes(token), `Shared Gmail OTP reader is missing: ${token}`);
}

for (const token of [
  'defineSecret("OWNER_CONTRACT_OTP_PEPPER")',
  'OTP_HASH_ALGORITHM = "HMAC_SHA256_OWNER_CONTRACT_V1"',
  'crypto.createHmac("sha256", args.pepper)',
  'args.requestId',
  'args.uid',
  'args.contractHash',
  'args.otp',
  'args.salt',
  'secrets: [smtpUser, smtpPass, ownerContractOtpPepper]',
  'secrets: [ownerContractOtpPepper]',
  'status: "REISSUE_REQUIRED"',
  'providerAccepted: true',
  'BRANDED_FROM',
]) {
  assert.ok(otpSecurity.includes(token), `Mailbox-authoritative Owner OTP callable is missing: ${token}`);
}
for (const forbidden of [
  'retrieveContractSignatureOtpForTestEvidence',
  'encryptTestEvidence',
  'decryptTestEvidence',
  'createCipheriv',
  'createDecipheriv',
  'testAccount',
  'testEvidence',
  'createHash("sha256").update(`${otp}:${salt}`)',
]) {
  assert.ok(!otpSecurity.includes(forbidden), `Owner OTP callable contains forbidden test recovery path: ${forbidden}`);
}

assert.ok(wrapper.includes("mode === 'lifecycle'"), 'Owner suite wrapper must expose lifecycle mode');
assert.ok(wrapper.includes("run('scripts/run-owner-onboarding-production-evidence-secure.mjs')"), 'Owner suite wrapper must execute the mailbox-authoritative acquisition evidence runner');
assert.ok(!wrapper.includes("run('scripts/run-owner-onboarding-production-evidence.mjs')"), 'Protected Owner evidence must not directly execute the legacy OTP runner');
assert.ok(wrapper.includes("mode === 'restore-shared-fixtures'"), 'Owner suite wrapper must expose fixture restoration mode');
assert.ok(wrapper.includes("run('scripts/seed-live-role-test-data.mjs')"), 'Owner suite wrapper must restore shared live-role fixtures');
assert.ok(ownerSpec.includes("scripts/run-owner-business-suite-evidence.mjs', mode"), 'Owner Playwright suite must execute the production lifecycle wrapper with an explicit mode');
assert.ok(ownerSpec.includes("runOwnerSuiteCommand('lifecycle')"), 'Owner Playwright beforeAll must run acquisition evidence');
assert.ok(ownerSpec.includes("runOwnerSuiteCommand('restore-shared-fixtures')"), 'Owner Playwright afterAll must restore shared fixtures');
assert.ok(ownerSpec.indexOf("runOwnerSuiteCommand('lifecycle')") < ownerSpec.indexOf("runOwnerSuiteCommand('restore-shared-fixtures')"), 'Owner acquisition must execute before shared fixtures are restored');
assert.ok(ownerSpec.includes("new RegExp(ACQUIRED_PROPERTY, 'i')"), 'Owner dashboard must assert the property generated by acquisition, not a seeded fallback');
assert.ok(ownerSpec.includes("contractId=${encodeURIComponent(String(intakeId))}"), 'Owner contract page must open the generated acquisition contract directly');
assert.ok(ownerSpec.includes("new RegExp(String(invoiceId), 'i')"), 'Owner financial page must assert the generated mobilization invoice ID');
assert.ok(ownerSpec.includes("testInfo.attach('owner-onboarding-production-evidence'"), 'Owner Playwright suite must attach execution-generated evidence');
assert.ok(ownerSpec.includes("adminRejectionProven: true"), 'Owner Playwright suite must require rejection evidence');
assert.ok(ownerSpec.includes("approvalIdempotentReplay: true"), 'Owner Playwright suite must require idempotent approval evidence');

assert.ok(financials.includes("collection(db, 'invoices')"), 'Owner financials must query the invoices collection');
assert.ok(financials.includes("where('ownerUid', '==', user.uid)"), 'Owner invoice visibility must be UID-scoped');
assert.ok(financials.includes("invoice.invoiceId || invoice.id"), 'Owner financials must render the canonical invoice ID');
assert.ok(financials.includes("ONBOARDING & SERVICE INVOICES"), 'Owner financials must label the invoice ledger clearly');

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

assert.ok(runtime.includes('export * from "./contractSignatureOtpMailbox";'), 'Functions runtime must export only the mailbox-authoritative Owner OTP callable layer');
assert.ok(!runtime.includes('export * from "./contractSignatureOtpSecure";'), 'Functions runtime must not export the test-retrieval Owner OTP callable layer');
assert.ok(!runtime.includes('export * from "./contractSignatureOtp";'), 'Functions runtime must not export the legacy Owner OTP callables');
assert.ok(runtime.includes('export * from "./ownerOnboardingLifecycleEmail";'), 'Owner lifecycle email triggers must be deployed through the Functions runtime');

console.log('owner onboarding production proof launch regression: PASS');
