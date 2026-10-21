'use strict';
// Feature 6: broker vacancy alerts go only to approved brokers in the listing's emirate.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore } = require('./_setup.cjs');
const bv = lib('brokerVacancyAlerts.js');
const approved = (extra = {}) => ({ role: 'broker', reraVerified: true, brokerKycStatus: 'verified', ...extra });
const kyc = { reraVerified: true, brokerKycStatus: 'verified', submissionHash: 'h1', approvedSubmissionHash: 'h1' };

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/b_ad').set(approved({ emirate: 'Abu Dhabi' }));
  await db.doc('users/b_any').set(approved());
  await db.doc('users/b_dxb').set(approved({ serviceEmirates: ['DUBAI'] }));
  await db.doc('users/b_unverified').set({ role: 'broker', reraVerified: false });
  await db.doc('users/b_stale').set(approved());
  for (const id of ['b_ad', 'b_any', 'b_dxb', 'b_unverified']) await db.doc(`broker_kyc_profiles/${id}`).set(kyc);
  await db.doc('broker_kyc_profiles/b_stale').set({ ...kyc, approvedSubmissionHash: 'old' });
});

test('only eligible brokers in the emirate are alerted, with configured commission text', async () => {
  await db.doc('system_config/broker_commission').set({ summary: 'Commission per BIN schedule B-2026.' });
  const r = await bv.alertBrokersForListing('L1', { emirate: 'ABU_DHABI', unitTitle: 'Palm Tower 1204', annualRent: 90000, area: 'Al Reem' });
  assert.equal(r.sent, 2);
  const n = (await db.doc('notifications/broker_vacancy_L1_b_ad').get()).data();
  assert.match(n.body, /Commission per BIN schedule B-2026\./);
  assert.equal(n.link, '/broker/listings?listing=L1&ref=b_ad');
  assert.ok((await db.doc('notifications/broker_vacancy_L1_b_any').get()).exists);
  assert.equal((await db.doc('notifications/broker_vacancy_L1_b_dxb').get()).exists, false);
  assert.equal((await db.doc('notifications/broker_vacancy_L1_b_stale').get()).exists, false);
});

test('isLiveListing needs all verification flags', () => {
  const live = { active: true, approved: true, hasBinContract: true, verifiedByAdmin: true };
  assert.equal(bv.isLiveListing(live), true);
  assert.equal(bv.isLiveListing({ ...live, status: 'RENTED' }), false);
  assert.equal(bv.isLiveListing({ ...live, verifiedByAdmin: false }), false);
});
