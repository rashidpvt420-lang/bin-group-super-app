import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Broker KYC submission invalidates any previous approval binding', async () => {
  const source = await read('functions/secureBrokerKycSubmission.ts');
  assert.match(source, /legacySubmitBrokerKycProfile/);
  assert.match(source, /result\?\.idempotent === true/);
  assert.match(source, /BROKER_KYC_APPROVAL_INVALIDATED_BY_RESUBMISSION/);
  assert.match(source, /approvedSubmissionHash:\s*FieldValue\.delete\(\)/);
  assert.match(source, /reraVerified:\s*false/);
  assert.match(source, /ibanVerified:\s*false/);
  assert.match(source, /admin\.auth\(\)\.updateUser\(uid, \{ displayName \}\)/);
});

test('Admin Broker review validates the private vault and exact submission hash', async () => {
  const source = await read('functions/secureBrokerKycReview.ts');
  assert.match(source, /collection\("broker_kyc_profiles"\)\.doc\(brokerId\)/);
  assert.match(source, /privateProfile\.submissionHash/);
  assert.match(source, /Broker KYC submission changed during review/);
  assert.match(source, /approvedSubmissionHash:\s*approved \? submissionHash/);
  assert.match(source, /ADMIN_APPROVE_BROKER_KYC_PRIVATE_VAULT/);
  assert.match(source, /sensitiveValuesExcluded:\s*true/);
  assert.doesNotMatch(source, /transaction\.set\(publicRef,[\s\S]{0,900}bankIban:\s*text\(/);
});

test('Broker payout authority reads approved bank data only from private KYC', async () => {
  const source = await read('functions/secureBrokerPayoutOperations.ts');
  assert.match(source, /collection\("broker_kyc_profiles"\)\.doc\(auth\.uid\)/);
  assert.match(source, /approvedSubmissionHash !== submissionHash/);
  assert.match(source, /kycSubmissionHash:\s*broker\.approvedSubmissionHash/);
  assert.match(source, /bankName:\s*text\(broker\.bankProfile\.bankName\)/);
  assert.match(source, /bankIban:\s*text\(broker\.bankProfile\.bankIban\)/);
  assert.doesNotMatch(source, /bankIban:\s*text\(broker\.profile\.bankIban/);
  assert.match(source, /Broker KYC changed after OTP verification/);
});

test('runtime explicitly overrides legacy Broker KYC and payout callables', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export \{ submitBrokerKycProfile \} from "\.\/secureBrokerKycSubmission";/);
  assert.match(runtime, /export \{ adminReviewBrokerKyc \} from "\.\/secureBrokerKycReview";/);
  assert.match(runtime, /submitBrokerPayoutRequest,[\s\S]*from "\.\/secureBrokerPayoutOperations";/);
});
