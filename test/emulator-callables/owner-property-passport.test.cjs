'use strict';
// Property Passport: ownership-checked asset writes, owner-only register, storage-only photos, linked inspections.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { ownerUpsertPropertyAsset, getOwnerPropertyPassport } = lib('runtimeAll.js');
const pp = lib('ownerPropertyPassport.js');
let owner, other, tenant;
const PHOTO = 'https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/rooms%2Fk.jpg?alt=media';
test.before(async () => {
  owner = await createUser('opp_owner', { role: 'owner' });
  other = await createUser('opp_owner2', { role: 'owner' });
  tenant = await createUser('opp_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure: warranty states and photo URL policy', () => {
  assert.equal(pp.warrantyState('2026-10-01', '2026-11-01').state, 'EXPIRED');
  assert.equal(pp.warrantyState('2026-12-01', '2026-11-01').state, 'EXPIRING');
  assert.equal(pp.warrantyState('2028-01-01', '2026-11-01').state, 'ACTIVE');
  assert.equal(pp.warrantyState('', '2026-11-01').state, 'NOT_RECORDED');
  assert.deepEqual(pp.cleanPhotos([PHOTO]), [PHOTO]);
  assert.throws(() => pp.cleanPhotos(['https://evil.example/x.jpg']));
  assert.throws(() => pp.cleanPhotos(new Array(7).fill(PHOTO)));
});

test('owner registers assets only on own property and sees only own passport', async () => {
  await db.doc('properties/p1').set({ ownerId: 'opp_owner', name: 'Villa 1' });
  await db.doc('properties/p2').set({ ownerId: 'opp_owner2', name: 'Other' });
  await db.doc('inspections/i1').set({ propertyId: 'p1', status: 'completed', tenantId: 'x' });
  await db.doc('inspections/i2').set({ propertyId: 'p2', status: 'completed', tenantId: 'y' });
  const created = await call(ownerUpsertPropertyAsset, owner, { propertyId: 'p1', name: 'Split AC', category: 'hvac', serialNumber: 'SN-1', warrantyExpiry: '2030-01-01', room: 'Kitchen', photoUrls: [PHOTO] });
  const asset = (await db.doc(`property_assets/${created.assetId}`).get()).data();
  assert.equal(asset.ownerId, 'opp_owner');
  assert.match(asset.qrToken, /^[0-9a-f]{24}$/);
  await expectHttpsError(call(ownerUpsertPropertyAsset, owner, { propertyId: 'p2', name: 'X' }), 'permission-denied');
  await expectHttpsError(call(ownerUpsertPropertyAsset, other, { propertyId: 'p2', assetId: created.assetId, name: 'Hijack' }), 'not-found');
  await expectHttpsError(call(ownerUpsertPropertyAsset, tenant, { propertyId: 'p1', name: 'X' }), 'permission-denied');
  await call(ownerUpsertPropertyAsset, owner, { propertyId: 'p1', assetId: created.assetId, name: 'Split AC 2', category: 'HVAC' });
  const res = await call(getOwnerPropertyPassport, owner, {});
  assert.deepEqual(res.properties.map((p) => p.propertyId), ['p1']);
  assert.equal(res.assets.length, 1);
  assert.equal(res.assets[0].name, 'Split AC 2');
  assert.equal(res.assets[0].qrPath, `/owner?asset=${created.assetId}`);
  assert.deepEqual(res.inspections.map((i) => i.inspectionId), ['i1']);
  const res2 = await call(getOwnerPropertyPassport, other, {});
  assert.equal(res2.assets.length, 0);
});

test('rules: owners read only their own assets; no client writes', async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-otc-rules-passport', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'property_assets/a1'), { ownerId: 'opp_owner' }); });
    const as = (uid) => env.authenticatedContext(uid, { role: 'owner', email: `${uid}@example.com`, email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(as('opp_owner'), 'property_assets/a1')));
    await assertFails(getDoc(doc(as('opp_owner2'), 'property_assets/a1')));
    await assertFails(setDoc(doc(as('opp_owner'), 'property_assets/a2'), { ownerId: 'opp_owner' }));
  } finally { await env.cleanup(); }
});
