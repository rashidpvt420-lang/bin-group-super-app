import fs from 'node:fs';
import assert from 'node:assert/strict';

const lifecycle = fs.readFileSync(new URL('../../scripts/run-owner-inspection-first-production-evidence.mjs', import.meta.url), 'utf8');
const gmailReader = fs.readFileSync(new URL('../../scripts/lib/gmail-otp-reader.mjs', import.meta.url), 'utf8');
const wrapper = fs.readFileSync(new URL('../../scripts/run-owner-business-suite-evidence.mjs', import.meta.url), 'utf8');
const ownerSpec = fs.readFileSync(new URL('../e2e/business-owner.spec.ts', import.meta.url), 'utf8');
const financials = fs.readFileSync(new URL('../../src/owner/pages/OwnerFinancialsPage.tsx', import.meta.url), 'utf8');
const onboarding = fs.readFileSync(new URL('../../functions/inspectionFirstOwnerOnboarding.ts', import.meta.url), 'utf8');
const inspectionLink = fs.readFileSync(new URL('../../functions/ownerInspectionAdminLink.ts', import.meta.url), 'utf8');
const inspectionCompletion = fs.readFileSync(new URL('../../functions/ownerInspectionCompletion.ts', import.meta.url), 'utf8');
const secureApproval = fs.readFileSync(new URL('../../functions/securePaymentApproval.ts', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../../functions/runtime.ts', import.meta.url), 'utf8');

for (const token of [
  "callFunction('submitPendingOwnerRegistration'",
  "callFunction('getOwnerPaymentConfiguration'",
  "callFunction('uploadOwnerInspectionProofDocument'",
  "callFunction('previewOwnerInspectionQuote'",
  "callFunction('requestOwnerInspectionSignatureOtp'",
  "callFunction('verifyOwnerInspectionSignatureOtp'",
  "callFunction('submitOwnerInspectionFirstOnboarding'",
  "callFunction('adminCreateOwnerPortfolioPropertyInspection'",
  "callFunction('adminLinkOwnerPropertyInspection'",
  "callFunction('adminRecordOwnerPropertyInspectionEvidence'",
  "callFunction('adminCompleteOwnerPortfolioInspections'",
  "callFunction('adminRecordOwnerMobilizationPaymentEvidence'",
  "callFunction('adminApprovePayment'",
  'signInWithRequiredTotpMfa',
  'readGmailOtp',
  'HMAC_SHA256_OWNER_INSPECTION_V1',
  'paymentNotDueBeforeInspections: true',
  'serverGeneratedPropertyIds: [expectedPropertyId]',
  'sensitiveValuesExcluded: true',
  'owner-onboarding-production-evidence.json',
  'hardLaunchClaim: false',
]) {
  assert.ok(lifecycle.includes(token), `Inspection-first Owner production proof is missing: ${token}`);
}

for (const forbidden of [
  'previewOwnerOnboardingQuote',
  'submitOwnerOnboardingPaymentPackage',
  "method: 'BANK_TRANSFER'",
  "paymentMethod: 'BANK_TRANSFER'",
  'retrieveContractSignatureOtpForTestEvidence',
  'for (let number = 0; number <= 999999; number += 1)',
  'hardLaunchClaim: true',
]) {
  assert.ok(!lifecycle.includes(forbidden), `Inspection-first Owner evidence contains a retired or unsafe path: ${forbidden}`);
}

for (const token of [
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'functions:secrets:access',
  "from './lib/gmail-otp-reader.mjs'",
  'expectedMailboxEmail: ownerMailboxEmail',
  'recipient: ownerEmail',
  "subject: 'BIN GROUP property application signature OTP'",
  'correlationId: requestId',
  'providerMessageId',
  'mailboxReceiptVerified: true',
  'mailboxMessageIdHash: receipt.messageIdHash',
  'value.testEvidence === undefined',
]) {
  assert.ok(lifecycle.includes(token), `Mailbox-authoritative Owner OTP evidence is missing: ${token}`);
}

for (const token of [
  'gmail.googleapis.com/gmail/v1/users/me/profile',
  'gmail.googleapis.com/gmail/v1/users/me/messages',
  'attachments/${encodeURIComponent(attachmentId)}',
  'matched multiple messages',
  'strict base64url',
]) {
  assert.ok(gmailReader.includes(token), `Shared Gmail OTP reader is missing: ${token}`);
}

assert.ok(wrapper.includes("mode === 'lifecycle'"), 'Owner suite wrapper must expose lifecycle mode');
assert.ok(wrapper.includes("run('scripts/run-owner-inspection-first-production-evidence.mjs')"), 'Owner suite wrapper must execute the inspection-first acquisition evidence runner');
assert.ok(!wrapper.includes('run-owner-onboarding-production-evidence-secure.mjs'), 'Owner suite wrapper must not execute the legacy payment-first runner');
assert.ok(wrapper.includes("mode === 'restore-shared-fixtures'"), 'Owner suite wrapper must expose fixture restoration mode');
assert.ok(wrapper.includes("run('scripts/seed-live-role-test-data.mjs')"), 'Owner suite wrapper must restore shared live-role fixtures');

assert.ok(ownerSpec.includes("scripts/run-owner-business-suite-evidence.mjs', mode"), 'Owner Playwright suite must execute the lifecycle wrapper with an explicit mode');
assert.ok(ownerSpec.includes("runOwnerSuiteCommand('lifecycle')"), 'Owner Playwright beforeAll must run acquisition evidence');
assert.ok(ownerSpec.includes("runOwnerSuiteCommand('restore-shared-fixtures')"), 'Owner Playwright afterAll must restore shared fixtures');
assert.ok(ownerSpec.includes('serverGeneratedPropertyIds'), 'Owner Playwright proof must require server-generated property IDs');
assert.ok(ownerSpec.includes('inspectionEvidence'), 'Owner Playwright proof must require genuine visit evidence');
assert.ok(ownerSpec.includes("method: 'CASH'"), 'Owner Playwright proof must require the Phase 1 Cash payment method');
assert.ok(ownerSpec.includes("mfaSecondFactorType: 'totp'"), 'Owner Playwright proof must require Founder TOTP approval');
assert.ok(ownerSpec.includes("new RegExp(ACQUIRED_PROPERTY, 'i')"), 'Owner dashboard must assert the acquisition-generated property');
assert.ok(ownerSpec.includes('contractId=${encodeURIComponent(String(intakeId))}'), 'Owner contract page must open the generated contract directly');
assert.ok(ownerSpec.includes("testInfo.attach('owner-onboarding-production-evidence'"), 'Owner Playwright suite must attach execution-generated evidence');

for (const token of [
  'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1',
  'const propertyId = safeId(`${intakeId}_property_${index + 1}`',
  'paymentDueAfterInspection: false',
  'approvedMethods.includes(method)',
  'paymentConfigVersion: activeConfiguration.version',
  'paymentConfigHash: activeConfiguration.configHash',
]) {
  assert.ok(onboarding.includes(token), `Five-page Owner backend is missing: ${token}`);
}
for (const token of [
  'adminCreateOwnerPortfolioPropertyInspection',
  'adminLinkOwnerPropertyInspection',
  'inspectionIds.length !== properties.length',
]) {
  assert.ok(inspectionLink.includes(token), `Per-property Admin inspection linking is missing: ${token}`);
}
for (const token of [
  'adminRecordOwnerPropertyInspectionEvidence',
  'distanceMetres > MAX_ARRIVAL_DISTANCE_METRES',
  'checklistVerified: true',
  'evidenceHash',
  'evidenceGeneration',
  'adminCompleteOwnerPortfolioInspections',
]) {
  assert.ok(inspectionCompletion.includes(token), `Evidence-backed visit completion is missing: ${token}`);
}
for (const token of [
  'sign_in_second_factor',
  'Every property visit must be verified before final payment approval',
  'Immutable 15% receipt evidence is required before final approval',
  'submittedVersion !== activeConfiguration.version',
  'submittedHash !== activeConfiguration.configHash',
]) {
  assert.ok(secureApproval.includes(token), `Secure final approval gate is missing: ${token}`);
}

assert.ok(financials.includes("collection(db, 'invoices')"), 'Owner financials must query invoices');
assert.ok(financials.includes("where('ownerUid', '==', user.uid)"), 'Owner invoice visibility must be UID scoped');
assert.ok(financials.includes('invoice.invoiceId || invoice.id'), 'Owner financials must render the canonical invoice ID');
assert.ok(runtime.includes('export * from "./inspectionFirstOwnerOnboarding";'), 'Runtime must export inspection-first Owner callables');
assert.ok(runtime.includes('export * from "./ownerInspectionAdminLink";'), 'Runtime must export Admin inspection linking');
assert.ok(runtime.includes('export * from "./ownerInspectionCompletion";'), 'Runtime must export evidence-backed inspection completion');
assert.ok(runtime.includes('export { adminApprovePayment, adminRejectPayment } from "./securePaymentApproval";'), 'Runtime must export the secure payment approval gate');

console.log('inspection-first Owner production proof launch regression: PASS');
