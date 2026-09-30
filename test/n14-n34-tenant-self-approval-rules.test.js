// N-14 / N-34 regressions (Firestore rules).
// N-14: a tenant could set any maintenanceRequests status, create inspections / move_out_requests
//       already approved, and self-confirm (or later self-approve) amenity bookings.
// N-34: tenantDocuments with tenantId == 'ALL' were readable by every signed-in user.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const ctx = (uid, claims) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const seed = (path, data) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));
const adminClaims = { role: 'admin', admin: true, firebase: { sign_in_second_factor: 'phone' } };
const tenant = () => ctx('tenant_n14', { role: 'tenant' });

describe('N-14 / N-34 tenant self-approval rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('users/tenant_n14', { uid: 'tenant_n14', role: 'tenant', propertyId: 'prop_n14', unitId: 'unit_n14', status: 'active' });
    await seed('properties/prop_n14', { ownerId: 'owner_n14', name: 'Tower N14' });
    await seed('maintenanceRequests/mr_open', { tenantId: 'tenant_n14', status: 'pending', title: 'Leak' });
    await seed('amenityBookings/bk_pending', { tenantUid: 'tenant_n14', propertyId: 'prop_n14', amenityName: 'Pool', status: 'pending' });
    await seed('tenantDocuments/doc_all', { tenantId: 'ALL', title: 'Broadcast', storagePath: 'x/y.pdf' });
    await seed('tenantDocuments/doc_own', { tenantId: 'tenant_n14', title: 'Own lease' });
  });
  after(async () => testEnv.cleanup());

  it('N-14: a tenant cannot resolve, approve or close its own maintenance request', async () => {
    for (const status of ['resolved', 'approved', 'CLOSED', 'completed', 'in_progress']) {
      await assertFails(updateDoc(doc(tenant(), 'maintenanceRequests/mr_open'), { status, updatedAt: serverTimestamp() }));
    }
    await assertFails(addDoc(collection(tenant(), 'maintenanceRequests'), { tenantId: 'tenant_n14', status: 'resolved', title: 'x' }));
    await assertFails(addDoc(collection(tenant(), 'maintenanceRequests'), { tenantId: 'tenant_n14', status: 'pending', approved: true }));
  });
  it('N-14 control: a tenant can submit a pending maintenance request and withdraw it', async () => {
    await assertSucceeds(addDoc(collection(tenant(), 'maintenanceRequests'), { tenantId: 'tenant_n14', status: 'pending', title: 'AC' }));
    await assertSucceeds(addDoc(collection(tenant(), 'maintenanceRequests'), { tenantId: 'tenant_n14', title: 'No status' }));
    await assertSucceeds(updateDoc(doc(tenant(), 'maintenanceRequests/mr_open'), { status: 'cancelled', updatedAt: serverTimestamp() }));
  });

  it('N-14: a tenant cannot create an inspection or move-out request that is already approved', async () => {
    const approvedShapes = [
      { status: 'approved' },
      { status: 'APPROVED' },
      { status: 'completed' },
      { approved: true },
      { approvedBy: 'tenant_n14', approvedAt: serverTimestamp() },
      { ownerApproved: true },
    ];
    for (const shape of approvedShapes) {
      await assertFails(addDoc(collection(tenant(), 'inspections'), { tenantId: 'tenant_n14', type: 'MOVE_OUT', ...shape }));
      await assertFails(addDoc(collection(tenant(), 'move_out_requests'), { tenantUid: 'tenant_n14', ...shape }));
    }
  });
  it('N-14 control: pending inspection and move-out submissions are still allowed; another tenant cannot', async () => {
    await assertSucceeds(addDoc(collection(tenant(), 'inspections'), { tenantId: 'tenant_n14', type: 'MOVE_IN', status: 'submitted' }));
    await assertSucceeds(addDoc(collection(tenant(), 'move_out_requests'), { tenantUid: 'tenant_n14', status: 'pending', moveOutDate: '2026-12-01' }));
    await assertFails(addDoc(collection(ctx('tenant_other', { role: 'tenant' }), 'move_out_requests'), { tenantUid: 'tenant_n14', status: 'pending' }));
  });

  it('N-14: a tenant cannot self-confirm or self-approve an amenity booking', async () => {
    for (const status of ['booked', 'approved', 'confirmed']) {
      await assertFails(addDoc(collection(tenant(), 'amenityBookings'), { tenantUid: 'tenant_n14', propertyId: 'prop_n14', amenityName: 'Pool', status }));
      await assertFails(updateDoc(doc(tenant(), 'amenityBookings/bk_pending'), { status }));
    }
    await assertFails(addDoc(collection(tenant(), 'amenityBookings'), { tenantUid: 'tenant_n14', propertyId: 'prop_n14', status: 'pending', approvedBy: 'Admin' }));
    await assertFails(updateDoc(doc(tenant(), 'amenityBookings/bk_pending'), { approvedBy: 'Admin', approvedAt: serverTimestamp() }));
  });
  it('N-14 control: tenant books as pending and can cancel; the property Owner and Admin can approve', async () => {
    await assertSucceeds(addDoc(collection(tenant(), 'amenityBookings'), { tenantUid: 'tenant_n14', propertyId: 'prop_n14', unitId: 'unit_n14', amenityName: 'Gym', bookingDate: '2026-10-01', timeSlot: '09:00', status: 'pending', createdAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(tenant(), 'amenityBookings/bk_pending'), { status: 'cancelled', cancelledAt: serverTimestamp() }));
    await seed('amenityBookings/bk_pending2', { tenantUid: 'tenant_n14', propertyId: 'prop_n14', amenityName: 'Pool', status: 'pending' });
    await assertSucceeds(updateDoc(doc(ctx('owner_n14', { role: 'owner' }), 'amenityBookings/bk_pending2'), { status: 'approved', approvedAt: serverTimestamp(), approvedBy: 'owner_n14' }));
    await seed('amenityBookings/bk_pending3', { tenantUid: 'tenant_n14', propertyId: 'prop_n14', amenityName: 'Pool', status: 'pending' });
    await assertSucceeds(updateDoc(doc(ctx('admin_n14', adminClaims), 'amenityBookings/bk_pending3'), { status: 'approved', approvedAt: serverTimestamp(), approvedBy: 'Admin' }));
  });

  it("N-34: tenantDocuments with tenantId 'ALL' are not readable by arbitrary signed-in users", async () => {
    await assertFails(getDoc(doc(ctx('random_user', {}), 'tenantDocuments/doc_all')));
    await assertFails(getDoc(doc(tenant(), 'tenantDocuments/doc_all')));
  });
  it('N-34 control: a tenant still reads its own documents; Admin reads all', async () => {
    await assertSucceeds(getDoc(doc(tenant(), 'tenantDocuments/doc_own')));
    await assertFails(getDoc(doc(ctx('tenant_other', { role: 'tenant' }), 'tenantDocuments/doc_own')));
    await assertSucceeds(getDoc(doc(ctx('admin_n14', adminClaims), 'tenantDocuments/doc_all')));
  });
});
