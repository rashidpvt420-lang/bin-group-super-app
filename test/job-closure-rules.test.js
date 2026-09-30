// Job evidence gate (Firestore rules). The admin branch of the maintenanceTickets update router
// allowed any field, so an admin browser could write status CLOSED / COMPLETED directly (skipping
// every evidence check) or forge server-confirmed evidence / arrival / exception fields.
// Closing and proof fields are now callable-only; routine admin edits still work.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const ctx = (uid, claims) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const seed = (path, data) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));
const adminDb = () => ctx('admin_jcr', { role: 'admin', admin: true });
const ceoDb = () => ctx('ceo_jcr', { role: 'ceo' });
const techDb = () => ctx('tech_jcr', { role: 'technician' });
const dispatcherDb = () => ctx('disp_jcr', { role: 'dispatcher' });

describe('Job closure / evidence-gate rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('users/admin_jcr', { uid: 'admin_jcr', role: 'admin', status: 'active' });
    await seed('users/ceo_jcr', { uid: 'ceo_jcr', role: 'ceo', status: 'active' });
    await seed('users/tech_jcr', { uid: 'tech_jcr', role: 'technician', status: 'active', approvalStatus: 'approved' });
    await seed('technicians/tech_jcr', { uid: 'tech_jcr', role: 'technician', status: 'active', approvalStatus: 'approved' });
    await seed('users/disp_jcr', { uid: 'disp_jcr', role: 'dispatcher', status: 'active' });
    await seed('maintenanceTickets/job_jcr', {
      propertyId: 'prop_jcr', ownerId: 'owner_jcr', tenantId: 'tenant_jcr',
      assignedTechnicianId: 'tech_jcr', status: 'IN_PROGRESS', estimatedCost: 200,
    });
    await seed('maintenanceTickets/job_jcr/evidence_exceptions/exc_1', { status: 'PENDING', ticketId: 'job_jcr' });
  });
  after(async () => testEnv.cleanup());

  it('an admin cannot close, complete or resolve a job by a direct write', async () => {
    for (const status of ['CLOSED', 'closed', 'COMPLETED', 'COMPLETED_PENDING_APPROVAL', 'RESOLVED', 'TENANT_APPROVED', 'PENDING_TENANT_REVIEW', 'AWAITING_REVIEW']) {
      await assertFails(updateDoc(doc(adminDb(), 'maintenanceTickets/job_jcr'), { status }));
    }
    await assertFails(updateDoc(doc(ceoDb(), 'maintenanceTickets/job_jcr'), { status: 'CLOSED' }));
  });

  it('an admin cannot forge server-verified evidence, arrival, closure or exception fields', async () => {
    const forgeries = [
      { technicianAfterEvidenceState: 'CONFIRMED', technicianAfterConfirmationId: 'x' },
      { technicianBeforePhotos: ['https://example.invalid/b.jpg'] },
      { arrivedAt: new Date(), arrivedLocation: { lat: 25.2, lng: 55.27, accuracy: 5 }, onSiteVerification: 'GPS_VERIFIED' },
      { closureEvidenceGate: { mode: 'EVIDENCE_COMPLETE' } },
      { evidenceExceptionId: 'exc_1', evidenceExceptionStatus: 'APPROVED' },
      { tenantApproved: true, finalApproval: true },
      { reopenedAt: new Date() },
    ];
    for (const forged of forgeries) await assertFails(updateDoc(doc(adminDb(), 'maintenanceTickets/job_jcr'), forged));
  });

  it('control: routine admin ticket management still works (estimate, owner-approval routing, notes)', async () => {
    await seed('maintenanceTickets/job_open', { propertyId: 'prop_jcr', ownerId: 'owner_jcr', status: 'OPEN' });
    await assertSucceeds(updateDoc(doc(adminDb(), 'maintenanceTickets/job_open'), { estimatedCost: 1500, status: 'AWAITING_OWNER_APPROVAL' }));
    await assertSucceeds(updateDoc(doc(adminDb(), 'maintenanceTickets/job_open'), { estimatedCost: 400, status: 'ESTIMATED' }));
    await assertSucceeds(updateDoc(doc(adminDb(), 'maintenanceTickets/job_jcr'), { adminNotes: 'Called the tenant' }));
    await assertSucceeds(updateDoc(doc(adminDb(), 'maintenanceTickets/job_jcr'), { status: 'CANCELLED', cancellationReason: 'Duplicate' }));
  });

  it('nobody can write evidence exception records from a browser (server-only subcollection)', async () => {
    for (const db of [adminDb(), techDb(), dispatcherDb()]) {
      await assertFails(setDoc(doc(db, 'maintenanceTickets/job_jcr/evidence_exceptions/exc_forged'), {
        recordType: 'JOB_EVIDENCE_EXCEPTION', ticketId: 'job_jcr', status: 'APPROVED', decidedBy: 'someone', approvedMissingEvidence: ['AFTER_PHOTO'],
      }));
      await assertFails(updateDoc(doc(db, 'maintenanceTickets/job_jcr/evidence_exceptions/exc_1'), { status: 'APPROVED' }));
    }
  });

  it('control: technicians and dispatchers still cannot change status to a closure state', async () => {
    await assertFails(updateDoc(doc(techDb(), 'maintenanceTickets/job_jcr'), { status: 'COMPLETED' }));
    await assertFails(updateDoc(doc(dispatcherDb(), 'maintenanceTickets/job_jcr'), { status: 'CLOSED' }));
    await assertSucceeds(getDoc(doc(adminDb(), 'maintenanceTickets/job_jcr')));
  });
});
