'use strict';
// Privacy Centre: own access log, own-data export, correction requests, expiring/revocable shares.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const fns = lib('runtimeAll.js');
const pc = lib('ownerPrivacyCentre.js');
let owner, other, tenant;
test.before(async () => {
  owner = await createUser('opc_owner', { role: 'owner' });
  other = await createUser('opc_owner2', { role: 'owner' });
  tenant = await createUser('opc_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure: share state', () => {
  const now = Date.parse('2026-11-01T00:00:00Z');
  assert.equal(pc.shareState({ expiresAt: '2026-11-02T00:00:00Z' }, now), 'ACTIVE');
  assert.equal(pc.shareState({ expiresAt: '2026-10-31T00:00:00Z' }, now), 'EXPIRED');
  assert.equal(pc.shareState({ expiresAt: '2026-11-02T00:00:00Z', revokedAt: 'x' }, now), 'REVOKED');
  assert.equal(pc.shareState({}, now), 'EXPIRED');
});

test('export, corrections, shares and access log are own-data only', async () => {
  await db.doc('properties/p1').set({ ownerId: 'opc_owner', name: 'Mine' });
  await db.doc('properties/p2').set({ ownerId: 'opc_owner2', name: 'Theirs' });
  await db.doc('audit_logs/x1').set({ action: 'ADMIN_VIEW_OWNER', actorId: 'adm', actorRole: 'admin', targetOwnerId: 'opc_owner', createdAt: new Date() });
  await db.doc('audit_logs/x2').set({ action: 'ADMIN_VIEW_OWNER', actorId: 'adm', actorRole: 'admin', targetOwnerId: 'opc_owner2', createdAt: new Date() });
  const exp = await call(fns.ownerExportMyData, owner, {});
  assert.deepEqual(exp.properties.map((p) => p.id), ['p1']);
  await expectHttpsError(call(fns.ownerSubmitCorrectionRequest, owner, { field: 'NOPE', details: 'hello there' }), 'invalid-argument');
  await call(fns.ownerSubmitCorrectionRequest, owner, { field: 'lease', details: 'End date is wrong' });
  await expectHttpsError(call(fns.ownerCreateDataShare, owner, { granteeEmail: 'a@b.com', scope: 'STATEMENTS', expiresInDays: 91 }), 'invalid-argument');
  const sh = await call(fns.ownerCreateDataShare, owner, { granteeEmail: 'Accountant@Example.com', scope: 'statements', expiresInDays: 7 });
  await expectHttpsError(call(fns.ownerRevokeDataShare, other, { shareId: sh.shareId }), 'not-found');
  let c = await call(fns.getOwnerPrivacyCentre, owner, {});
  assert.equal(c.shares[0].state, 'ACTIVE');
  assert.equal(c.shares[0].granteeEmail, 'accountant@example.com');
  assert.equal(c.corrections[0].field, 'LEASE');
  assert.ok(c.accessLog.some((e) => e.id === 'x1'));
  assert.ok(!c.accessLog.some((e) => e.id === 'x2'));
  await call(fns.ownerRevokeDataShare, owner, { shareId: sh.shareId });
  c = await call(fns.getOwnerPrivacyCentre, owner, {});
  assert.equal(c.shares[0].state, 'REVOKED');
  assert.equal((await call(fns.getOwnerPrivacyCentre, other, {})).shares.length, 0);
  await expectHttpsError(call(fns.ownerExportMyData, tenant, {}), 'permission-denied');
});

test('rules: owners read only their own shares/corrections; no client writes', async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-otc-rules-privacy', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async (cx) => {
      await setDoc(doc(cx.firestore(), 'privacy_shares/s1'), { ownerId: 'opc_owner' });
      await setDoc(doc(cx.firestore(), 'owner_correction_requests/c1'), { ownerId: 'opc_owner' });
    });
    const as = (uid) => env.authenticatedContext(uid, { role: 'owner', email: `${uid}@example.com`, email_verified: true }).firestore();
    for (const p of ['privacy_shares/s1', 'owner_correction_requests/c1']) {
      await assertSucceeds(getDoc(doc(as('opc_owner'), p)));
      await assertFails(getDoc(doc(as('opc_owner2'), p)));
    }
    await assertFails(setDoc(doc(as('opc_owner'), 'privacy_shares/s2'), { ownerId: 'opc_owner' }));
  } finally { await env.cleanup(); }
});
