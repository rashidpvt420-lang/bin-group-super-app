'use strict';
// Regression: property onboarding stores only a declared unit count (e.g. units: 1 on a villa) and
// nothing created units/{unitId} records, so activated properties had units > 0 but no unit
// records (reported legacy ACTIVE villa shape). Declared units are now provisioned when a property
// becomes ACTIVE, and admins get an audited, MFA-gated backfill for already-active properties.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { provisionDeclaredUnitsOnPropertyActivation, adminProvisionDeclaredPropertyUnits, ownerGenerateUnits } = runtime;

const OWNER = 'owner_declared_units';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const owner = { uid: OWNER, token: { role: 'owner', email: 'owner.declared.units@example.invalid', email_verified: true } };

const snapshot = (data) => (data ? { exists: true, data: () => data } : { exists: false, data: () => undefined });
async function activate(propertyId, before, after) {
  await db.doc(`properties/${propertyId}`).set(after);
  return provisionDeclaredUnitsOnPropertyActivation.run({
    data: { before: snapshot(before), after: snapshot(after) },
    params: { propertyId },
  });
}
const unitsOf = async (propertyId) => (await db.collection('units').where('propertyId', '==', propertyId).get()).docs;
const property = (overrides = {}) => ({ ownerId: OWNER, ownerUid: OWNER, ownerEmail: owner.token.email, name: 'Declared Units Villa', propertyType: 'Villa', ...overrides });

let adminUser;
let adminNoMfa;
test.before(async () => {
  await createUser(OWNER, { role: 'owner' }, { email: owner.token.email });
  adminUser = await createUser('admin_declared_units', { role: 'admin', admin: true }, { tokenExtra: MFA });
  adminNoMfa = await createUser('admin_declared_units_nomfa', { role: 'admin', admin: true });
});
test.beforeEach(async () => clearFirestore());

test('activating a property with a declared unit count creates exactly those unit records once', async () => {
  const pending = property({ units: 3, status: 'PENDING_PROPERTY_INSPECTION', activationStatus: 'LOCKED_PENDING_INSPECTION_AND_PAYMENT' });
  const active = { ...pending, status: 'ACTIVE', activationStatus: 'ACTIVE' };
  const result = await activate('tower_three', pending, active);
  assert.equal(result.status, 'CREATED');
  const units = await unitsOf('tower_three');
  assert.deepEqual(units.map((doc) => doc.id).sort(), ['tower_three_1', 'tower_three_2', 'tower_three_3']);
  for (const doc of units) {
    assert.equal(doc.data().ownerId, OWNER);
    assert.equal(doc.data().status, 'VACANT');
    assert.equal(doc.data().source, 'PROPERTY_ACTIVATION_DECLARED_UNITS');
  }
  assert.equal((await db.doc('properties/tower_three').get()).data().unitRecordsProvisionedCount, 3);
  const audit = await db.collection('audit_logs').where('action', '==', 'PROPERTY_DECLARED_UNITS_PROVISIONED').get();
  assert.equal(audit.size, 1);

  // Re-running is a no-op, and the owner wizard skips the provisioned numbers.
  const again = await adminProvisionDeclaredPropertyUnits.run({ auth: { uid: adminUser.uid, token: adminUser.token }, data: { propertyId: 'tower_three' }, rawRequest: {} });
  assert.equal(again.status, 'ALREADY_HAS_UNITS');
  const wizard = await call(ownerGenerateUnits, owner, { propertyId: 'tower_three', count: 3 });
  assert.equal(wizard.status, 'NO_CHANGES');
  assert.equal((await unitsOf('tower_three')).length, 3);
});

test('properties that already have units, are not newly active, or declare nothing are left alone', async () => {
  const active = property({ units: 2, status: 'ACTIVE' });
  await db.doc('units/existing_1').set({ propertyId: 'has_units', unitNumber: 'A1' });
  assert.equal((await activate('has_units', property({ units: 2, status: 'PENDING' }), active)).status, 'ALREADY_HAS_UNITS');
  assert.equal((await unitsOf('has_units')).length, 1);

  assert.equal(await activate('already_active', active, { ...active, name: 'renamed' }), null);
  assert.equal((await unitsOf('already_active')).length, 0);

  assert.equal((await activate('no_count', null, property({ status: 'ACTIVE' }))).status, 'NO_DECLARED_UNITS');
  assert.equal((await activate('huge', null, property({ units: 500, status: 'ACTIVE' }))).status, 'TOO_MANY_DECLARED_UNITS');
  assert.equal((await unitsOf('huge')).length, 0);
});

test('admin backfill fixes an already-active units:1 villa with no unit record (live shape)', async () => {
  await db.doc('properties/villa_live_shape').set(property({ units: 1, status: 'ACTIVE', activationStatus: 'ACTIVE' }));
  const result = await call(adminProvisionDeclaredPropertyUnits, adminUser, { propertyId: 'villa_live_shape' });
  assert.equal(result.status, 'CREATED');
  const units = await unitsOf('villa_live_shape');
  assert.deepEqual(units.map((doc) => [doc.id, doc.data().unitNumber, doc.data().source]), [['villa_live_shape_1', '1', 'ADMIN_DECLARED_UNITS_BACKFILL']]);
});

test('backfill is admin + MFA only and refuses inactive or missing properties', async () => {
  await db.doc('properties/villa_pending').set(property({ units: 1, status: 'PENDING_PROPERTY_INSPECTION' }));
  await db.doc('properties/villa_active').set(property({ units: 1, status: 'ACTIVE' }));
  await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, owner, { propertyId: 'villa_active' }), 'permission-denied');
  await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, adminNoMfa, { propertyId: 'villa_active' }), 'permission-denied');
  await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, adminUser, { propertyId: 'villa_pending' }), 'failed-precondition');
  await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, adminUser, { propertyId: 'nope' }), 'not-found');
  await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, adminUser, {}), 'invalid-argument');
  assert.equal((await unitsOf('villa_active')).length, 0);
  assert.equal((await unitsOf('villa_pending')).length, 0);
});


test('malformed declarations, conflicting activation and missing ownership never create units', async () => {
  for (const units of [1.5, true, {}, 'bogus', -1, Infinity]) {
    const result = await activate('invalid_count', null, property({ units, status: 'ACTIVE' }));
    assert.equal(result.status, 'NO_DECLARED_UNITS');
    assert.equal((await unitsOf('invalid_count')).length, 0);
  }
  assert.equal(await activate('conflicting', null, property({ units: 2, status: 'ACTIVE', activationStatus: 'LOCKED_PENDING_PAYMENT' })), null);
  assert.equal((await activate('unbound', null, { units: 2, status: 'ACTIVE' })).status, 'OWNER_BINDING_MISSING');
  assert.equal((await unitsOf('unbound')).length, 0);
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});

test('sanitised IDs cannot overwrite or adopt units from a different property', async () => {
  await db.doc('units/villa_a_1').set({ propertyId: 'villa_a', ownerId: 'other_owner', unitNumber: '1', tenantId: 'existing_tenant' });
  const result = await activate('villa.a', null, property({ units: 2, status: 'ACTIVE' }));
  assert.equal(result.status, 'UNIT_ID_COLLISION');
  assert.equal((await unitsOf('villa.a')).length, 0);
  assert.equal((await db.doc('units/villa_a_1').get()).data().tenantId, 'existing_tenant');
  assert.equal((await db.doc('units/villa_a_2').get()).exists, false);
  assert.equal((await db.doc('properties/villa.a').get()).data().unitRecordsProvisionedAt, undefined);
});

test('concurrent backfills create one complete set and one audit, with the 200-unit cap', async () => {
  await db.doc('properties/concurrent').set(property({ units: 200, status: 'ACTIVE' }));
  const results = await Promise.all(Array.from({ length: 3 }, () => call(adminProvisionDeclaredPropertyUnits, adminUser, { propertyId: 'concurrent' })));
  assert.equal(results.filter((result) => result.status === 'CREATED').length, 1);
  assert.equal((await unitsOf('concurrent')).length, 200);
  const audits = await db.collection('audit_logs').where('action', '==', 'PROPERTY_DECLARED_UNITS_PROVISIONED').get();
  assert.equal(audits.size, 1);
  assert.equal(audits.docs[0].data().metadata.unitIds.length, 200);
});

test('backfill rejects suspended accounts and invalid identifiers without truncation', async () => {
  await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, { ...adminUser, token: { ...adminUser.token, suspended: true } }, { propertyId: 'villa' }), 'permission-denied');
  for (const propertyId of ['a/b', '..', 'x'.repeat(161), { id: 'villa' }]) {
    await expectHttpsError(call(adminProvisionDeclaredPropertyUnits, adminUser, { propertyId }), 'invalid-argument');
  }
});
