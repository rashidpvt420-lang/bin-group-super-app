'use strict';
// Audit D-03 (Rashid, Nov 2026): suspending an owner suspends SERVICES, not the account.
// The owner keeps sign-in (Auth not disabled, no suspended claim) and can still pay; new service
// requests are refused on the server except emergencies (clause 9F); tenants' emergency requests on
// that owner's units still go through. A clause 9F contract suspension still allows emergencies.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminSuspendOwner, adminResumeOwner, ownerCreateMaintenanceTicket, createTenantServiceTicket } = lib('runtimeAll.js');
const { contractGrantsService, ownerServicesSuspended } = lib('propertyServiceEntitlement.js');

const OWNER = 'owner_svc_susp';
const TENANT = 'tenant_svc_susp';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const owner = { uid: OWNER, token: { role: 'owner', email: 'owner.svc@example.invalid', email_verified: true } };
const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant.svc@example.invalid', email_verified: true } };
const verifiedAt = admin.firestore.Timestamp.fromMillis(Date.parse('2026-09-01T08:00:00Z'));
const PAID = { ownerId: OWNER, ownerUid: OWNER, status: 'ACTIVE', contractStatus: 'active', paymentVerified: true, paymentStatus: 'APPROVED' };
let adminActor;

async function seed({ contract = PAID, ownerProfile = {} } = {}) {
  await db.doc(`users/${OWNER}`).set({ role: 'owner', status: 'active', ...ownerProfile });
  await db.doc(`users/${TENANT}`).set({ role: 'tenant', status: 'active', email: tenant.token.email });
  await db.doc('contracts/c_svc').set(contract);
  await db.doc('properties/p_svc').set({
    name: 'Suspension Villa', ownerId: OWNER, ownerUid: OWNER, units: 1, propertyType: 'Villa', status: 'ACTIVE', contractId: 'c_svc',
    emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Zakher', address: 'Zakher, Al Ain',
    geo: { lat: 24.17, lng: 55.7, emirate: 'Abu Dhabi', city: 'Al Ain', area: 'Zakher', address: 'Zakher, Al Ain',
      verified: true, dispatchReady: true, verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'admin_manual' },
    geoVerification: { state: 'VERIFIED', verifiedBy: 'founder_uid', verifiedAt, verificationVersion: 1, source: 'FOUNDER_MFA_REVIEW' },
  });
  await db.doc('units/u_svc').set({ propertyId: 'p_svc', tenantId: TENANT, tenantUid: TENANT, unitNumber: '1' });
}
const ownerTicket = (priority) => call(ownerCreateMaintenanceTicket, owner, { propertyId: 'p_svc', category: 'Plumbing', priority, description: 'Water leaking from the ceiling' });
const tenantTicket = (kind, id, details = { category: 'Plumbing', description: 'Water leaking from the ceiling' }) =>
  call(createTenantServiceTicket, tenant, { kind, unitId: 'u_svc', propertyId: 'p_svc', clientRequestId: id, details });

test.before(async () => {
  await createUser(OWNER, { role: 'owner' }, { email: owner.token.email });
  await createUser(TENANT, { role: 'tenant' }, { email: tenant.token.email });
  adminActor = await createUser('admin_svc_susp', { role: 'admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

test('adminSuspendOwner suspends services only: account stays enabled, no suspended claim', async () => {
  await seed();
  const result = await call(adminSuspendOwner, adminActor, { ownerId: OWNER, reason: 'Overdue mobilisation invoice' });
  assert.equal(result.status, 'SERVICES_SUSPENDED');
  const record = await admin.auth().getUser(OWNER);
  assert.equal(record.disabled, false);
  assert.notEqual(record.customClaims?.suspended, true);
  const profile = (await db.doc(`users/${OWNER}`).get()).data();
  assert.equal(profile.serviceSuspended, true);
  assert.equal(profile.status, 'active', 'login status is not changed');
  const audit = await db.collection('audit_logs').where('action', '==', 'ADMIN_SUSPEND_OWNER_SERVICES').get();
  assert.equal(audit.size, 1);
});

test('services suspended: owner non-emergency refused, owner emergency accepted', async () => {
  await seed({ ownerProfile: { serviceSuspended: true } });
  const error = await expectHttpsError(ownerTicket('normal'), 'failed-precondition');
  assert.equal(error.details?.reason, 'OWNER_SERVICES_SUSPENDED');
  await expectHttpsError(ownerTicket('urgent'), 'failed-precondition');
  await ownerTicket('emergency');
  const tickets = await db.collection('maintenanceTickets').get();
  assert.equal(tickets.size, 1);
  assert.equal(tickets.docs[0].data().priority, 'emergency');
});

test('services suspended: tenant emergency goes through, tenant routine request refused', async () => {
  await seed({ ownerProfile: { serviceSuspended: true } });
  const ok = await tenantTicket('EMERGENCY', 'svc-susp-emergency-0001');
  assert.equal(ok.status, 'SUCCESS');
  const error = await expectHttpsError(
    tenantTicket('AI_CONCIERGE', 'svc-susp-routine-0001', { category: 'Plumbing', priority: 'normal', description: 'Tap is dripping slowly', photoEvidenceExpected: true }),
    'failed-precondition',
  );
  assert.equal(error.details?.reason, 'OWNER_SERVICES_SUSPENDED');
});

test('clause 9F contract suspension still allows emergencies, refuses routine work', async () => {
  const contract = { ...PAID, status: 'SUSPENDED', serviceSuspended: true, serviceSuspension: { previousStatus: 'ACTIVE', noticeId: 'SUSP-1' } };
  await seed({ contract, ownerProfile: { serviceSuspended: true } });
  await expectHttpsError(ownerTicket('normal'), 'failed-precondition');
  await ownerTicket('emergency');
  const ok = await tenantTicket('EMERGENCY', 'svc-susp-9f-emergency-0001');
  assert.equal(ok.status, 'SUCCESS');
  assert.equal(contractGrantsService(contract, OWNER), false);
  assert.equal(contractGrantsService(contract, OWNER, { emergency: true }), true);
  // A contract SUSPENDED for another reason (no serviceSuspended flag) never grants service.
  assert.equal(contractGrantsService({ ...PAID, status: 'SUSPENDED' }, OWNER, { emergency: true }), false);
});

test('adminResumeOwner restores services', async () => {
  await seed();
  await call(adminSuspendOwner, adminActor, { ownerId: OWNER, reason: 'Overdue mobilisation invoice' });
  const result = await call(adminResumeOwner, adminActor, { ownerId: OWNER });
  assert.equal(result.status, 'SERVICES_RESTORED');
  assert.equal((await db.doc(`users/${OWNER}`).get()).data().serviceSuspended, false);
  await ownerTicket('normal');
  assert.equal((await db.collection('maintenanceTickets').get()).size, 1);
});

test('ownerServicesSuspended pure checks', () => {
  assert.equal(ownerServicesSuspended({ serviceSuspended: true }), true);
  assert.equal(ownerServicesSuspended({ status: 'suspended' }), true);
  assert.equal(ownerServicesSuspended({ status: 'active' }), false);
  assert.equal(ownerServicesSuspended(undefined), false);
});
