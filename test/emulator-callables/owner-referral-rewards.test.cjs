'use strict';
// Owner referral rewards: programme OFF by default, one code per owner, new owners only, no self
// referral, human Finance (MFA) approval tied to a real unvoided cash/cheque collection by the
// referred owner, no approval by a party to the referral, record reuse blocked.
// Reward is service credit only (no cash payout, no card).
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const {
  adminSetOwnerReferralProgram, ownerGetReferralCode, ownerApplyReferralCode,
  financeApproveOwnerReferralReward, financeRejectOwnerReferral,
} = lib('runtimeAll.js');
const rr = lib('ownerReferralRewards.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const RID = (c) => c.repeat(32);

let adminUser, adminNoMfa, finance, financeReferrer, ownerA, ownerN, ownerM;
test.before(async () => {
  adminUser = await createUser('rr_admin', { role: 'admin', admin: true }, { tokenExtra: MFA });
  adminNoMfa = await createUser('rr_admin_nomfa', { role: 'admin', admin: true });
  finance = await createUser('rr_finance', { role: 'finance_admin' }, { tokenExtra: MFA });
  financeReferrer = await createUser('rr_fin_owner', { role: 'finance_admin' }, { tokenExtra: MFA });
  ownerA = await createUser('rr_owner_a', { role: 'owner' });
  ownerN = await createUser('rr_owner_n', { role: 'owner' });
  ownerM = await createUser('rr_owner_m', { role: 'owner' });
});
test.beforeEach(async () => { await clearFirestore(); });

const enable = () => call(adminSetOwnerReferralProgram, adminUser, { enabled: true, rewardAed: '250.00' });
const record = (id, over = {}) => db.doc(`payment_collection_records/${id}`).set({
  payerUid: 'rr_owner_n', targetType: 'invoice', targetId: 'inv_1', amount: 1000, method: 'cheque', status: 'collected', ...over,
});

test('code and reward helpers are strict', () => {
  const c = rr.generateReferralCode();
  assert.match(c, /^BIN-[A-Z2-9]{8}$/);
  assert.equal(rr.normaliseCode(c.toLowerCase()), c);
  assert.throws(() => rr.normaliseCode('BIN-0000OOOO'));
  assert.throws(() => rr.parseRewardAed('0'));
  assert.throws(() => rr.parseRewardAed('10.005'));
  assert.throws(() => rr.parseRewardAed('10001'));
  assert.equal(rr.parseRewardAed('250.50'), 250.5);
});

test('only MFA admins set the programme; versioned and audited', async () => {
  await expectHttpsError(call(adminSetOwnerReferralProgram, ownerA, { enabled: true, rewardAed: 100 }), 'permission-denied');
  await expectHttpsError(call(adminSetOwnerReferralProgram, adminNoMfa, { enabled: true, rewardAed: 100 }), 'permission-denied');
  await expectHttpsError(call(adminSetOwnerReferralProgram, adminUser, { enabled: true, rewardAed: '-1' }), 'invalid-argument');
  await enable();
  const v2 = await call(adminSetOwnerReferralProgram, adminUser, { enabled: false, rewardAed: 300 });
  assert.equal(v2.version, 2);
  assert.equal((await db.collection('owner_referral_program/config/history').get()).size, 2);
  assert.equal((await db.collection('audit_logs').where('action', '==', 'OWNER_REFERRAL_PROGRAM_SET').get()).size, 2);
});

test('owner gets one stable code; non-owners refused', async () => {
  await expectHttpsError(call(ownerGetReferralCode, null, {}), 'unauthenticated');
  await expectHttpsError(call(ownerGetReferralCode, finance, {}), 'permission-denied');
  const a = await call(ownerGetReferralCode, ownerA, {});
  const b = await call(ownerGetReferralCode, ownerA, {});
  assert.equal(a.code, b.code);
  assert.equal(b.created, false);
  assert.equal((await db.doc(`owner_referral_codes/${a.code}`).get()).get('ownerUid'), 'rr_owner_a');
});

test('apply: programme must be on, new owners only, no self referral, once only', async () => {
  const { code } = await call(ownerGetReferralCode, ownerA, {});
  await expectHttpsError(call(ownerApplyReferralCode, ownerN, { code }), 'failed-precondition');
  await enable();
  await expectHttpsError(call(ownerApplyReferralCode, ownerA, { code }), 'failed-precondition');
  await expectHttpsError(call(ownerApplyReferralCode, ownerN, { code: 'BIN-ZZZZZZZZ' }), 'not-found');
  await expectHttpsError(call(ownerApplyReferralCode, ownerN, { code: 'nope' }), 'invalid-argument');
  await db.doc(`payment_collection_records/${RID('e')}`).set({ payerUid: 'rr_owner_m', status: 'collected', method: 'cash' });
  await expectHttpsError(call(ownerApplyReferralCode, ownerM, { code }), 'failed-precondition');
  const r1 = await call(ownerApplyReferralCode, ownerN, { code });
  assert.equal(r1.status, 'PENDING_VERIFIED_PAYMENT');
  assert.equal((await call(ownerApplyReferralCode, ownerN, { code })).idempotent, true);
  const other = await call(ownerGetReferralCode, ownerM, {});
  await expectHttpsError(call(ownerApplyReferralCode, ownerN, { code: other.code }), 'already-exists');
});

test('finance approval needs a real unvoided cash/cheque payment by the referred owner; no party approves; record used once', async () => {
  await enable();
  const { code } = await call(ownerGetReferralCode, ownerA, {});
  await call(ownerApplyReferralCode, ownerN, { code });
  const approve = (actor, recId) => call(financeApproveOwnerReferralReward, actor, { referralId: 'rr_owner_n', collectionRecordId: recId });

  await expectHttpsError(approve(ownerA, RID('a')), 'permission-denied');
  await expectHttpsError(approve(finance, RID('a')), 'not-found');
  await record(RID('b'), { payerUid: 'rr_owner_m' });
  await expectHttpsError(approve(finance, RID('b')), 'failed-precondition');
  await record(RID('c'), { method: 'card' });
  await expectHttpsError(approve(finance, RID('c')), 'failed-precondition');
  await record(RID('d'));
  await db.doc(`payment_collection_voids/${RID('d')}`).set({ reason: 'bounced' });
  await expectHttpsError(approve(finance, RID('d')), 'failed-precondition');

  // A Finance Admin who is the referrer cannot approve their own reward.
  await db.doc('owner_referrals/rr_owner_n').update({ referrerUid: 'rr_fin_owner' });
  await record(RID('f'));
  await expectHttpsError(approve(financeReferrer, RID('f')), 'permission-denied');
  await db.doc('owner_referrals/rr_owner_n').update({ referrerUid: 'rr_owner_a' });

  const ok = await approve(finance, RID('f'));
  assert.equal(ok.status, 'REWARD_APPROVED');
  assert.equal(ok.rewardAed, 250);
  assert.equal((await approve(finance, RID('f'))).idempotent, true);
  const credit = (await db.doc('owner_referral_credits/rr_owner_n').get()).data();
  assert.equal(credit.ownerUid, 'rr_owner_a');
  assert.equal(credit.type, 'SERVICE_CREDIT');
  assert.equal(credit.amountAed, 250);
  assert.ok((await db.doc('notifications/referral_reward_rr_owner_n').get()).exists);
  assert.equal((await db.collection('audit_logs').where('action', '==', 'OWNER_REFERRAL_REWARD_APPROVED').get()).size, 1);

  // Same record cannot back a second referral.
  await db.doc('owner_referrals/rr_owner_x').set({ referrerUid: 'rr_owner_a', referredUid: 'rr_owner_n', status: 'PENDING_VERIFIED_PAYMENT' });
  await expectHttpsError(call(financeApproveOwnerReferralReward, finance, { referralId: 'rr_owner_x', collectionRecordId: RID('f') }), 'failed-precondition');
});

test('finance can reject with a written reason; programme off blocks approval', async () => {
  await enable();
  const { code } = await call(ownerGetReferralCode, ownerA, {});
  await call(ownerApplyReferralCode, ownerN, { code });
  await call(adminSetOwnerReferralProgram, adminUser, { enabled: false, rewardAed: 250 });
  await record(RID('9'));
  await expectHttpsError(call(financeApproveOwnerReferralReward, finance, { referralId: 'rr_owner_n', collectionRecordId: RID('9') }), 'failed-precondition');
  await expectHttpsError(call(financeRejectOwnerReferral, finance, { referralId: 'rr_owner_n', reason: 'no' }), 'invalid-argument');
  const rej = await call(financeRejectOwnerReferral, finance, { referralId: 'rr_owner_n', reason: 'Referred owner withdrew' });
  assert.equal(rej.status, 'REJECTED');
});
