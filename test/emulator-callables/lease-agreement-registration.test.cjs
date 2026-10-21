'use strict';
// Feature 2 (deep audit 2026-10-21 §7): government (Ejari / Tawtheeq) vs private tenancy agreements.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { ownerRecordLeaseAgreement } = lib('runtimeAll.js');
const la = lib('leaseAgreements.js');
const OWNER = 'owner_lease_reg';
const owner = { uid: OWNER, token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const other = { uid: 'owner_other', token: { role: 'owner', email: 'x@example.invalid', email_verified: true } };
const CERT = `owners/${OWNER}/tenancy-registrations/u1.pdf`;

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/p_ad').set({ ownerId: OWNER, emirate: 'Abu Dhabi' });
  await db.doc('properties/p_dxb').set({ ownerId: OWNER, emirate: 'Dubai' });
  await db.doc('units/u_ad').set({ propertyId: 'p_ad', tenantUid: 't1', tenantId: 't1' });
  await db.doc('units/u_dxb').set({ propertyId: 'p_dxb', tenantUid: 't2', tenantId: 't2' });
  await db.doc('units/u_empty').set({ propertyId: 'p_ad' });
});

test('authority follows the emirate', () => {
  assert.equal(la.authorityForEmirate('Dubai'), 'EJARI');
  assert.equal(la.authorityForEmirate('Abu Dhabi'), 'TAWTHEEQ');
  assert.equal(la.authorityForEmirate('Al Ain'), 'TAWTHEEQ');
  assert.equal(la.authorityForEmirate('Sharjah'), 'MUNICIPAL');
});

test('government agreement with number, date and certificate is REGISTERED with the right authority', async () => {
  const r = await call(ownerRecordLeaseAgreement, owner, { unitId: 'u_dxb', agreementType: 'GOVERNMENT', registrationNumber: '0123456789', registrationDate: '2026-09-01', certificatePath: CERT, startDate: '2026-09-01', endDate: '2027-08-31', annualRent: 85000 });
  assert.equal(r.registrationAuthority, 'EJARI');
  assert.equal(r.registrationStatus, 'REGISTERED');
  const lease = (await db.doc(`leases/${r.leaseId}`).get()).data();
  assert.equal(lease.endDate, '2027-08-31');
  assert.equal(lease.leaseEndDate, '2027-08-31');
  assert.equal(lease.leaseStatus, 'active');
  assert.equal(lease.annualRent, 85000);
});

test('government agreement without a certificate stays PENDING_REGISTRATION; private needs no registration', async () => {
  const g = await call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'GOVERNMENT', registrationNumber: 'TW-2026-1', startDate: '2026-09-01', endDate: '2027-08-31' });
  assert.equal(g.registrationAuthority, 'TAWTHEEQ');
  assert.equal(g.registrationStatus, 'PENDING_REGISTRATION');
  assert.equal((await db.doc(`leases/${g.leaseId}`).get()).data().leaseStatus, 'pending_registration');
  const p = await call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'PRIVATE', startDate: '2026-09-01', endDate: '2027-08-31' });
  assert.equal(p.leaseId, g.leaseId);
  assert.equal(p.registrationStatus, 'NOT_REGISTERED_PRIVATE');
  assert.equal(p.registrationAuthority, null);
});

test('guards: owner only, dates required and ordered, own certificate path, tenant linked', async () => {
  await expectHttpsError(call(ownerRecordLeaseAgreement, other, { unitId: 'u_ad', agreementType: 'PRIVATE', startDate: '2026-09-01', endDate: '2027-08-31' }), 'permission-denied');
  await expectHttpsError(call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'PRIVATE', startDate: '2026-09-01' }), 'invalid-argument');
  await expectHttpsError(call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'PRIVATE', startDate: '2027-09-01', endDate: '2026-08-31' }), 'invalid-argument');
  await expectHttpsError(call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'GOVERNMENT', certificatePath: 'owners/someone/tenancy-registrations/x.pdf', startDate: '2026-09-01', endDate: '2027-08-31' }), 'permission-denied');
  await expectHttpsError(call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'PRIVATE', registrationNumber: '12345', startDate: '2026-09-01', endDate: '2027-08-31' }), 'invalid-argument');
  await expectHttpsError(call(ownerRecordLeaseAgreement, owner, { unitId: 'u_empty', agreementType: 'PRIVATE', startDate: '2026-09-01', endDate: '2027-08-31' }), 'failed-precondition');
  await expectHttpsError(call(ownerRecordLeaseAgreement, owner, { unitId: 'u_ad', agreementType: 'MAYBE', startDate: '2026-09-01', endDate: '2027-08-31' }), 'invalid-argument');
});
