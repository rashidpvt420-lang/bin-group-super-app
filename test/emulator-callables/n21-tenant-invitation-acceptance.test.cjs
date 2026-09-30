'use strict';
// N-21 residual regressions for tenant invitation acceptance:
//  (a) accepting must not replace an existing owner/technician/privileged role;
//  (b) the stub lease/ledger migration must cover every row (not just 200) and be resumable;
//  (c) validateTenantInvitation must reject invitations already marked expired.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const fns = lib('index.js');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const future = () => admin.firestore.Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);

test.beforeEach(clearFirestore);

async function seedInvite(id, email, overrides = {}) {
  const token = `${id}-${'t'.repeat(40)}`;
  await db.doc(`tenant_invitations/${id}`).set({
    status: 'sent', tenantName: 'Tenant N21', tenantEmail: email, propertyId: 'prop-n21', propertyName: 'Tower',
    unitNumber: '101', inviteTokenHash: sha256(token), expiresAt: future(), ...overrides,
  });
  return token;
}

async function seedStubRows(stubId, leases, ledgers) {
  for (const [collection, count] of [['leases', leases], ['tenant_ledger', ledgers]]) {
    for (let start = 0; start < count; start += 400) {
      const batch = db.batch();
      for (let i = start; i < Math.min(count, start + 400); i += 1) batch.set(db.doc(`${collection}/${stubId}_${i}`), { tenantId: stubId, amount: i });
      await batch.commit();
    }
  }
}

async function countRows(collection, tenantId) {
  return (await db.collection(collection).where('tenantId', '==', tenantId).count().get()).data().count;
}

test('an owner account cannot accept a tenant invitation and keeps its owner role', async () => {
  const owner = await createUser('n21_owner', { role: 'owner' }, { email: 'n21-owner@example.invalid' });
  const token = await seedInvite('inv_owner', owner.token.email);
  const error = await expectHttpsError(call(fns.acceptTenantInvitation, owner, { token }), 'failed-precondition');
  assert.match(error.message, /owner role/);
  assert.equal((await admin.auth().getUser(owner.uid)).customClaims.role, 'owner');
  assert.equal((await db.doc('tenant_invitations/inv_owner').get()).data().status, 'sent');
});

test('a profile that already holds a technician role cannot be converted to tenant', async () => {
  const tech = await createUser('n21_tech_profile', {}, { email: 'n21-tech@example.invalid' });
  await db.doc(`users/${tech.uid}`).set({ role: 'technician', status: 'active' });
  const token = await seedInvite('inv_tech', tech.token.email);
  await expectHttpsError(call(fns.acceptTenantInvitation, tech, { token }), 'failed-precondition');
  assert.equal((await db.doc(`users/${tech.uid}`).get()).data().role, 'technician');
  assert.equal((await admin.auth().getUser(tech.uid)).customClaims?.role, undefined);
});

test('a fresh or tenant-role account can still accept', async () => {
  const tenant = await createUser('n21_tenant_ok', { role: 'tenant' }, { email: 'n21-ok@example.invalid' });
  await db.doc('units/unit_n21').set({ propertyId: 'prop-n21', unitNumber: '101' });
  const token = await seedInvite('inv_ok', tenant.token.email, { unitId: 'unit_n21' });
  const result = await call(fns.acceptTenantInvitation, tenant, { token });
  assert.equal(result.status, 'success');
  assert.equal((await admin.auth().getUser(tenant.uid)).customClaims.role, 'tenant');
  const invite = (await db.doc('tenant_invitations/inv_ok').get()).data();
  assert.equal(invite.status, 'accepted');
  assert.equal(invite.stubMigration.status, 'not_required');
  assert.equal((await db.doc('units/unit_n21').get()).data().tenantId, tenant.uid);
});

test('stub migration moves every lease and ledger row, beyond the old 200 cap', async () => {
  const tenant = await createUser('n21_tenant_big', {}, { email: 'n21-big@example.invalid' });
  const token = await seedInvite('inv_big', tenant.token.email, { tenantId: 'stub_big' });
  await seedStubRows('stub_big', 3, 450);
  await call(fns.acceptTenantInvitation, tenant, { token });
  assert.equal(await countRows('tenant_ledger', 'stub_big'), 0, 'no ledger rows left on the stub');
  assert.equal(await countRows('leases', 'stub_big'), 0);
  assert.equal(await countRows('tenant_ledger', tenant.uid), 450);
  assert.equal(await countRows('leases', tenant.uid), 3);
  const invite = (await db.doc('tenant_invitations/inv_big').get()).data();
  assert.equal(invite.stubMigration.status, 'complete');
  assert.equal(invite.stubMigration.ledgerRowsMigrated, 450);
});

test('the same invitee can resume an interrupted migration; another user cannot reuse the invite', async () => {
  const tenant = await createUser('n21_tenant_resume', { role: 'tenant' }, { email: 'n21-resume@example.invalid' });
  const token = await seedInvite('inv_resume', tenant.token.email, {
    tenantId: 'stub_resume', status: 'accepted', acceptedBy: tenant.uid, stubMigration: { status: 'failed' },
  });
  await db.doc(`users/${tenant.uid}`).set({ role: 'tenant', tenantInvitationId: 'inv_resume' });
  await seedStubRows('stub_resume', 1, 5);
  const result = await call(fns.acceptTenantInvitation, tenant, { token });
  assert.equal(result.status, 'success');
  assert.equal(await countRows('tenant_ledger', tenant.uid), 5);
  assert.equal((await db.doc('tenant_invitations/inv_resume').get()).data().stubMigration.status, 'complete');

  const other = await createUser('n21_other', {}, { email: 'n21-resume@example.invalid'.replace('resume', 'other') });
  await expectHttpsError(call(fns.acceptTenantInvitation, other, { token }), 'failed-precondition');
});

test('validateTenantInvitation rejects invitations marked expired or without an expiry', async () => {
  const expiredToken = await seedInvite('inv_marked_expired', 'n21-x@example.invalid', { status: 'expired' });
  await expectHttpsError(call(fns.validateTenantInvitation, null, { token: expiredToken }), 'failed-precondition');
  const noExpiryToken = await seedInvite('inv_no_expiry', 'n21-y@example.invalid', { expiresAt: null });
  await expectHttpsError(call(fns.validateTenantInvitation, null, { token: noExpiryToken }), 'failed-precondition');
  const liveToken = await seedInvite('inv_live', 'n21-z@example.invalid');
  const live = await call(fns.validateTenantInvitation, null, { token: liveToken });
  assert.equal(live.unitNumber, '101');
});
