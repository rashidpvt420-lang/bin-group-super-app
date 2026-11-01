'use strict';
// Owner Authority Register: grant with scope/permissions/expiry, revoke, history, own-data only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
const ar = lib('ownerAuthorityRegister.js');
let owner, other, tenant;
const future = new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10);
const good = { type: 'POWER_OF_ATTORNEY', holderName: 'Sara', holderEmail: 'sara@example.com', scope: 'Unit 1203 maintenance', permissions: ['VIEW_MAINTENANCE', 'REQUEST_MAINTENANCE'], expiresOn: future };
test.before(async () => {
  owner = await createUser('oar_owner', { role: 'owner' });
  other = await createUser('oar_owner2', { role: 'owner' });
  tenant = await createUser('oar_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('validation and role gate', async () => {
  await expectHttpsError(call(rt.ownerGrantAuthority, tenant, good), 'permission-denied');
  await expectHttpsError(call(rt.ownerGrantAuthority, owner, { ...good, expiresOn: '2020-01-01' }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerGrantAuthority, owner, { ...good, permissions: ['APPROVE_EVERYTHING'] }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerGrantAuthority, owner, { ...good, documentUrl: 'https://evil.example/doc.pdf' }), 'invalid-argument');
  assert.equal(ar.authorityState({ status: 'ACTIVE', expiresAt: { toMillis: () => Date.now() - 1 } }), 'EXPIRED');
});

test('grant, revoke, history; other owners cannot see or revoke', async () => {
  const g = await call(rt.ownerGrantAuthority, owner, good);
  let reg = await call(rt.getOwnerAuthorityRegister, owner, {});
  assert.equal(reg.authorities[0].state, 'ACTIVE');
  assert.equal((await call(rt.getOwnerAuthorityRegister, other, {})).authorities.length, 0);
  await expectHttpsError(call(rt.ownerRevokeAuthority, other, { authorityId: g.authorityId }), 'not-found');
  await call(rt.ownerRevokeAuthority, owner, { authorityId: g.authorityId, reason: 'Ended' });
  reg = await call(rt.getOwnerAuthorityRegister, owner, {});
  assert.equal(reg.authorities[0].state, 'REVOKED');
  assert.deepEqual(reg.history.map((h) => h.event).sort(), ['GRANTED', 'REVOKED']);
  assert.equal((await db.collection('audit_logs').where('targetOwnerId', '==', 'oar_owner').get()).size, 2);
});
