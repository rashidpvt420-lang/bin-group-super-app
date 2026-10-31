'use strict';
// Payout-detail change alerts: masked admin alert + EN/AR holder notification + audit; idempotent; no alert for non-bank edits.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore } = require('./_setup.cjs');

const { onOwnerBankAccountChanged, onBrokerPayoutDetailsChanged } = lib('runtimeAll.js');
const snap = (d) => (d ? { exists: true, data: () => d } : { exists: false, data: () => undefined });
const fire = (fn, params, before, after, id = `ev_${Math.random().toString(36).slice(2)}`) => fn.run({ id, data: { before: snap(before), after: snap(after) }, params });

test.before(async () => { await createUser('pca_owner', { role: 'owner' }, { email: 'pca.owner@example.invalid' }); });
test.beforeEach(clearFirestore);

test('a changed owner IBAN raises a masked alert, a bilingual notification, mail and audit', async () => {
  const before = { ownerId: 'pca_owner', iban: 'AE070331234567890123456', bankName: 'Bank A', accountHolder: 'R' };
  const after = { ...before, iban: 'AE460260001015333439101' };
  await fire(onOwnerBankAccountChanged, { accountId: 'b1' }, before, after, 'ev1');
  const alerts = await db.collection('payout_change_alerts').get();
  assert.equal(alerts.size, 1);
  const a = alerts.docs[0].data();
  assert.equal(a.kind, 'CHANGED');
  assert.deepEqual(a.changedFields, ['iban']);
  assert.equal(a.maskedIbanAfter, 'AE*****************9101');
  assert.ok(!JSON.stringify(a).includes('AE460260001015333439101'));
  const n = (await db.collection('notifications').where('type', '==', 'PAYOUT_DETAILS_CHANGED').get()).docs[0].data();
  assert.equal(n.userId, 'pca_owner');
  assert.ok(n.titleAr && n.bodyAr);
  assert.equal((await db.collection('mail').where('type', '==', 'PAYOUT_DETAILS_CHANGED').get()).size, 1);
  assert.equal((await db.collection('audit_logs').where('action', '==', 'PAYOUT_DETAILS_CHANGED').get()).size, 1);
  await fire(onOwnerBankAccountChanged, { accountId: 'b1' }, before, after, 'ev1');
  assert.equal((await db.collection('payout_change_alerts').get()).size, 1, 'retries are idempotent');
});

test('new broker bank details alert; edits that do not touch bank fields do not', async () => {
  await fire(onBrokerPayoutDetailsChanged, { uid: 'pca_broker' }, { phone: '1' }, { phone: '1', bankIban: 'AE070331234567890123456', bankName: 'B', bankAccountHolder: 'X' });
  const a = (await db.collection('payout_change_alerts').get()).docs[0].data();
  assert.equal(a.holderRole, 'broker');
  assert.deepEqual(a.changedFields.sort(), ['bankAccountHolder', 'bankIban', 'bankName']);
  await clearFirestore();
  await fire(onOwnerBankAccountChanged, { accountId: 'b2' }, { ownerId: 'pca_owner', iban: 'AE07', status: 'PENDING' }, { ownerId: 'pca_owner', iban: 'AE07', status: 'VERIFIED' });
  assert.equal((await db.collection('payout_change_alerts').get()).size, 0);
});
