import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Broker KYC submission invalidates any previous approval binding', async () => {
  const wrapper = await read('functions/secureBrokerKycSubmission.ts');
  const canonical = await read('functions/brokerKycProfile.ts');
  assert.match(canonical, /export async function submitBrokerKycProfileHandler/);
  assert.match(canonical, /submitBrokerKycProfileHandler,/);
  assert.match(wrapper, /import \{ submitBrokerKycProfileHandler \}/);
  assert.match(wrapper, /await submitBrokerKycProfileHandler\(request\)/);
  assert.doesNotMatch(wrapper, /legacySubmitBrokerKycProfile/);
  assert.doesNotMatch(wrapper, /\.run\(request\)/);
  assert.match(wrapper, /result\?\.idempotent === true/);
  assert.match(wrapper, /BROKER_KYC_APPROVAL_INVALIDATED_BY_RESUBMISSION/);
  assert.match(wrapper, /approvedSubmissionHash:\s*FieldValue\.delete\(\)/);
  assert.match(wrapper, /reraVerified:\s*false/);
  assert.match(wrapper, /ibanVerified:\s*false/);
  assert.match(wrapper, /authDisplayNameChangeDeferredUntilApproval:\s*true/);
  assert.doesNotMatch(wrapper, /admin\.auth\(\)\.updateUser\(uid/);
});

test('Admin Broker review validates the private vault and exact submission hash', async () => {
  const source = await read('functions/secureBrokerKycReview.ts');
  assert.match(source, /collection\("broker_kyc_profiles"\)\.doc\(brokerId\)/);
  assert.match(source, /privateProfile\.submissionHash/);
  assert.match(source, /Broker KYC submission changed during review/);
  assert.match(source, /approvedSubmissionHash:\s*approved \? submissionHash/);
  assert.match(source, /ADMIN_APPROVE_BROKER_KYC_PRIVATE_VAULT/);
  assert.match(source, /sensitiveValuesExcluded:\s*true/);
});

test('Broker payout authority reads approved bank data only from private KYC', async () => {
  const source = await read('functions/secureBrokerPayoutOperations.ts');
  assert.match(source, /collection\("broker_kyc_profiles"\)\.doc\(auth\.uid\)/);
  assert.match(source, /approvedSubmissionHash !== submissionHash/);
  assert.match(source, /kycSubmissionHash:\s*broker\.approvedSubmissionHash/);
  assert.match(source, /bankName:\s*text\(broker\.bankProfile\.bankName\)/);
  assert.match(source, /bankIban:\s*text\(broker\.bankProfile\.bankIban\)/);
  assert.match(source, /Broker KYC changed after OTP verification/);
});

test('runtime explicitly overrides legacy Broker KYC and payout callables', async () => {
  const runtime = await read('functions/runtime.ts');
  assert.match(runtime, /export\s*\{\s*submitBrokerKycProfile,\s*getBrokerKycProfileSummary\s*\}\s*from "\.\/secureBrokerKycSubmission";/);
  assert.match(runtime, /export \{ adminReviewBrokerKyc \} from "\.\/secureBrokerKycReview";/);
  assert.match(runtime, /submitBrokerPayoutRequest/);
  assert.match(runtime, /from "\.\/secureBrokerPayoutOperations";/);
});
