import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Phase 8 Broker KYC is callable-only, App Check protected and cannot be self-approved', async () => {
  const [profile, submission, review, rules] = await Promise.all([
    read('src/broker/pages/BrokerProfilePage.tsx'),
    read('functions/secureBrokerKycSubmission.ts'),
    read('functions/secureBrokerKycReview.ts'),
    read('firestore.rules'),
  ]);

  assert.match(profile, /submitBrokerKycProfile/);
  assert.match(profile, /getBrokerKycProfileSummary/);
  assert.doesNotMatch(profile, /broker_kyc_profiles/);
  assert.match(submission, /enforceAppCheck: true/);
  assert.match(submission, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(submission, /Current verified Broker authority is required/);

  assert.match(review, /adminReviewBrokerKyc = onCall/);
  assert.match(review, /enforceAppCheck: true/);
  assert.match(review, /sign_in_second_factor/);
  assert.match(review, /currentClaims = record\.customClaims \|\| \{\}/);
  assert.match(review, /brokerId === request\.auth\?\.uid/);
  assert.match(review, /Brokers cannot approve or reject their own KYC/);
  assert.match(review, /submissionHash/);
  assert.match(review, /approvedSubmissionHash/);

  assert.match(rules, /match \/broker_kyc_profiles\/\{brokerId\}/);
  assert.match(rules, /request\.auth\.uid == brokerId/);
  assert.match(rules, /allow create, update, delete: if false/);
});

test('Phase 8 Broker documents remain owner-scoped and Admin-reviewed', async () => {
  const [page, rules, storage, review] = await Promise.all([
    read('src/broker/pages/BrokerDocumentsPage.tsx'),
    read('firestore.rules'),
    read('storage.rules'),
    read('functions/secureBrokerKycReview.ts'),
  ]);

  assert.match(page, /where\('brokerId', '==', user\.uid\)/);
  assert.match(page, /pending_review/);
  assert.match(page, /brokerDocuments\/\$\{user\.uid\}/);
  assert.match(rules, /match \/brokerDocuments\/\{documentId\}/);
  assert.match(rules, /resource\.data\.get\('brokerId', null\) == request\.auth\.uid/);
  assert.match(rules, /allow update: if isAdmin\(\)/);
  assert.match(storage, /brokerDocuments/);
  assert.match(review, /verifyBrokerDocuments/);
  assert.match(review, /custom\.brokerId !== brokerId/);
  assert.match(review, /custom\.documentType !== documentType/);
});

test('Phase 8 Broker bank information stays private and only masked values return to the portal', async () => {
  const [profile, secureSummary, persistence, payout] = await Promise.all([
    read('src/broker/pages/BrokerProfilePage.tsx'),
    read('functions/secureBrokerKycSubmission.ts'),
    read('functions/brokerKycProfile.ts'),
    read('functions/secureBrokerPayoutOperations.ts'),
  ]);

  assert.match(profile, /bankIban/);
  assert.match(profile, /bankAccountHolder/);
  assert.match(profile, /getBrokerKycProfileSummary/);
  assert.doesNotMatch(profile, /broker_kyc_profiles/);

  assert.match(persistence, /bankIban/);
  assert.match(persistence, /bankIbanMasked/);
  assert.match(persistence, /broker_kyc_profiles/);
  assert.match(secureSummary, /bankIbanMasked/);
  assert.doesNotMatch(secureSummary, /bankIban:\s*privateData\.bankIban/);
  assert.match(payout, /privateKyc\.bankIban/);
});

test('Phase 8 Broker commission authority is immutable from the browser', async () => {
  const [rules, page, backend] = await Promise.all([
    read('firestore.rules'),
    read('src/broker/pages/BrokerCommissionsPage.tsx'),
    read('functions/brokerCommissions.ts'),
  ]);

  const blockStart = rules.indexOf('match /broker_commissions/{commissionId}');
  assert.ok(blockStart >= 0);
  const commissionRules = rules.slice(blockStart, blockStart + 500);
  assert.match(commissionRules, /resource\.data\.get\('brokerId', null\) == request\.auth\.uid/);
  assert.match(commissionRules, /allow create, update, delete: if false/);

  assert.doesNotMatch(page, /updateDoc\([^\n]*broker_commissions|setDoc\([^\n]*broker_commissions|addDoc\([^\n]*broker_commissions/);
  assert.match(backend, /adminReviewBrokerCommission = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /sign_in_second_factor/);
  assert.match(backend, /admin\.auth\(\)\.getUser\(auth\.uid\)/);
  assert.match(backend, /COMMISSION_RATE_REQUIRES_ADMIN_REVIEW/);
});

test('Phase 8 payout OTP and settlement cannot be bypassed by the Broker browser', async () => {
  const [payout, adminReview, page, rules] = await Promise.all([
    read('functions/secureBrokerPayoutOperations.ts'),
    read('functions/adminBrokerPayoutReview.ts'),
    read('src/broker/pages/BrokerCommissionsPage.tsx'),
    read('firestore.rules'),
  ]);

  for (const callable of ['requestBrokerPayoutOtp', 'verifyBrokerPayoutOtp', 'submitBrokerPayoutRequest']) {
    assert.match(payout, new RegExp(`export const ${callable}`));
  }
  assert.match(payout, /BROKER_PAYOUT_OTP_PEPPER/);
  assert.match(payout, /HMAC_SHA256_V1/);
  assert.match(payout, /createHmac\("sha256", otpPepper\(\)\)/);
  assert.match(payout, /kycSubmissionHash/);
  assert.match(payout, /status: "PENDING_ADMIN_REVIEW"/);
  assert.match(payout, /approvalStatus: "PENDING"/);
  assert.match(payout, /paymentStatus: "REQUESTED"/);
  assert.match(payout, /Current Broker role required/);

  assert.match(page, /requestBrokerPayoutOtp/);
  assert.match(page, /verifyBrokerPayoutOtp/);
  assert.match(page, /submitBrokerPayoutRequest/);
  assert.doesNotMatch(page, /adminReviewBrokerPayoutRequest/);

  assert.match(adminReview, /adminReviewBrokerPayoutRequest = onCall/);
  assert.match(adminReview, /enforceAppCheck: true/);
  assert.match(adminReview, /sign_in_second_factor/);
  assert.match(adminReview, /currentClaims = record\.customClaims \|\| \{\}/);
  assert.match(adminReview, /Only an approved payout request can be marked paid/);

  const payoutBlockStart = rules.indexOf('match /broker_payout_requests/{requestId}');
  assert.ok(payoutBlockStart >= 0);
  const payoutRules = rules.slice(payoutBlockStart, payoutBlockStart + 500);
  assert.match(payoutRules, /brokerOwns\(resource\.data\)/);
  assert.match(payoutRules, /allow create, update, delete: if false/);
});

test('Phase 8 Broker private records and pipeline ownership remain isolated', async () => {
  const rules = await read('firestore.rules');

  assert.match(rules, /match \/brokerLeads\/\{leadId\}[\s\S]*?resource\.data\.get\('brokerId', null\) == request\.auth\.uid/);
  assert.match(rules, /function safeBrokerLeadCreate\(data, leadId\)[\s\S]*?claimedRole\(\) == 'broker'/);
  assert.match(rules, /data\.get\('sourceLeadId', ''\) == leadId/);
  assert.match(rules, /broker_lead_' \+ request\.auth\.uid \+ '_' \+ leadId/);
  const referralStart = rules.indexOf('match /referrals/{referralId}');
  assert.ok(referralStart >= 0);
  const referralRules = rules.slice(referralStart, referralStart + 450);
  assert.match(referralRules, /allow create: if false/);
  assert.match(referralRules, /allow update, delete: if isAdmin\(\)/);
  assert.match(rules, /safeBrokerLeadUpdate\(\)[\s\S]*?hasOnly\(\[[\s\S]*?'status'[\s\S]*?'notes'[\s\S]*?'updatedAt'/);
  const leadUpdateStart = rules.indexOf('function safeBrokerLeadUpdate');
  const leadUpdateEnd = rules.indexOf('// Direct client open-mission claims', leadUpdateStart);
  assert.ok(leadUpdateStart >= 0 && leadUpdateEnd > leadUpdateStart);
  const leadUpdate = rules.slice(leadUpdateStart, leadUpdateEnd);
  assert.doesNotMatch(leadUpdate, /'attributionId'|'sourceLeadId'/);
});

test('Phase 8 listing access is KYC-gated, sanitized and read-only', async () => {
  const [backend, page, app, rules, runtime] = await Promise.all([
    read('functions/brokerListingAccess.ts'),
    read('src/broker/pages/BrokerListingsPage.tsx'),
    read('src/broker/BrokerApp.tsx'),
    read('firestore.rules'),
    read('functions/runtime.ts'),
  ]);

  assert.match(backend, /getBrokerVerifiedListings = onCall/);
  assert.match(backend, /enforceAppCheck: true/);
  assert.match(backend, /requireApprovedBroker/);
  assert.match(backend, /approvedSubmissionHash/);
  assert.match(backend, /reraVerified/);
  assert.match(backend, /SANITIZED_VERIFIED_LISTINGS_ONLY/);
  assert.match(backend, /ownerIdentityExposed: false/);
  assert.match(backend, /exactAddressExposed: false/);
  assert.match(backend, /exactCoordinatesExposed: false/);
  assert.match(backend, /browserClaimAuthority: false/);
  const projection = backend.slice(backend.indexOf('function publicListing'), backend.indexOf('export const getBrokerVerifiedListings'));
  assert.doesNotMatch(projection, /ownerEmail|ownerId|propertyAddress|latitude|longitude/);

  assert.match(page, /getBrokerVerifiedListings/);
  assert.match(page, /broker-listings-load-failed/);
  assert.match(page, /broker-listings-empty/);
  assert.match(page, /read-only/);
  assert.match(app, /path="\/listings"/);
  assert.match(runtime, /brokerListingAccess/);

  const claimStart = rules.indexOf('match /broker_listing_claims/{claimId}');
  assert.ok(claimStart >= 0);
  const claimRules = rules.slice(claimStart, claimStart + 650);
  assert.match(claimRules, /allow create, update, delete: if false/);
});

test('Phase 8 leads and deals preserve immutable server attribution', async () => {
  const [leads, app, deals, referralPage, referral] = await Promise.all([
    read('src/broker/pages/BrokerLeadsPage.tsx'),
    read('src/broker/BrokerApp.tsx'),
    read('src/broker/pages/BrokerAttributionProofPage.tsx'),
    read('src/broker/pages/BrokerReferralsPage.tsx'),
    read('functions/secureBrokerReferralSubmission.ts'),
  ]);

  assert.match(leads, /const leadRef = doc\(collection\(db, 'brokerLeads'\)\)/);
  assert.match(leads, /attributionId/);
  assert.match(leads, /sourceLeadId: leadRef\.id/);
  assert.match(app, /Deals & Attribution/);
  assert.match(app, /path: '\/broker\/attribution'/);
  assert.match(referralPage, /getBrokerVerifiedListings/);
  assert.match(referralPage, /submitBrokerReferral/);
  assert.doesNotMatch(referralPage, /collection\(db, 'properties'\)/);
  assert.doesNotMatch(referralPage, /ownerEmail|ownerId|ownerUid/);
  assert.match(deals, /broker_commissions/);
  assert.match(deals, /brokerLeads/);
  assert.match(deals, /referrals/);
  assert.match(referral, /submitBrokerReferral = onCall/);
  assert.match(referral, /enforceAppCheck: true/);
  assert.match(referral, /Approved Broker KYC\/RERA is required/);
  assert.match(referral, /privateOwnerLinkageServerResolved/);
  assert.match(referral, /BROKER_REFERRAL_SUBMITTED/);
});

test('Phase 8 notification lifecycle remains recipient-scoped for Brokers', async () => {
  const [app, rules, service] = await Promise.all([
    read('src/broker/BrokerApp.tsx'),
    read('firestore.rules'),
    read('src/services/notificationService.ts'),
  ]);

  assert.match(app, /<NotificationBell \/>/);
  assert.match(rules, /match \/notifications\/\{notificationId\}/);
  assert.match(rules, /recipientId.*request\.auth\.uid|userId.*request\.auth\.uid/);
  assert.match(service, /case 'broker': return '\/broker\/dashboard'/);
});

test('Phase 8 Broker portal exposes onboarding, listings, deals, commissions, documents and profile routes', async () => {
  const app = await read('src/broker/BrokerApp.tsx');
  for (const route of ['/dashboard', '/leads', '/referrals', '/listings', '/commissions', '/documents', '/profile']) {
    assert.ok(app.includes(`path="${route}"`), `Missing Broker route ${route}`);
  }
  assert.match(app, /Deals & Attribution/);
  assert.match(app, /path: '\/broker\/attribution'/);
});
