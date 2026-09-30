// N-07 / N-18 regression (Storage rules).
// N-07: submitted evidence (technician proofs/completion photos, tenant move-in inspection photos,
//       tenant/owner ticket attachments, hash-bound tenant receipts) could be overwritten in place.
// N-18: permissive design_requests / ai_design_renders blocks OR'ed over the later deny blocks, so
//       Owners could upload/read AI Design Studio media directly (server-written only by design).
import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadString } from 'firebase/storage';

// Storage rules cross-read Firestore in the emulator's own project, so use the exec project id.
const projectId = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
const IMG = { contentType: 'image/jpeg' };
let testEnv;

const actor = (uid, claims) => testEnv.authenticatedContext(uid, { email_verified: true, email: `${uid}@example.com`, ...claims }).storage();
const tech = () => actor('tech_n07', { role: 'technician' });
const tenant = () => actor('tenant_n07', { role: 'tenant' });
const owner = () => actor('owner_n07', { role: 'owner' });
const adminS = () => actor('admin_n07', { role: 'admin', admin: true });

describe('N-07 / N-18 storage evidence immutability', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
      storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'maintenanceTickets/t_n07'), {
        ownerId: 'owner_n07', tenantId: 'tenant_n07', assignedTechnicianId: 'tech_n07', status: 'IN_PROGRESS',
      });
    });
  });
  after(async () => testEnv.cleanup());

  async function seed(path, contentType = 'image/jpeg', metadata) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(), path), 'original-evidence', 'raw', { contentType, ...(metadata ? { customMetadata: metadata } : {}) });
    });
  }

  const technicianPaths = [
    'maintenanceTickets/t_n07/proofPhotos/after_1.jpg',
    'maintenanceTickets/t_n07/completionPhotos/after_1.jpg',
    'maintenanceTickets/t_n07/proofs/after_1.jpg',
    'proofs/t_n07/after_1.jpg',
    'evidence/t_n07/after_1.jpg',
  ];
  for (const path of technicianPaths) {
    it(`assigned technician can create but not overwrite or delete ${path}`, async () => {
      await assertSucceeds(uploadString(ref(tech(), path), 'new-evidence', 'raw', IMG));
      await assertFails(uploadString(ref(tech(), path), 'replaced-evidence', 'raw', IMG));
      await assertFails(deleteObject(ref(tech(), path)));
    });
  }

  it('tenant move-in inspection photos are create-only', async () => {
    const path = 'inspections/tenant_n07/1700000000_kitchen_sink.jpg';
    await assertSucceeds(uploadString(ref(tenant(), path), 'photo', 'raw', IMG));
    await assertFails(uploadString(ref(tenant(), path), 'swapped', 'raw', IMG));
    await assertFails(deleteObject(ref(tenant(), path)));
  });

  it('tenant and owner ticket attachments are create-only', async () => {
    const tPath = 'maintenanceTickets/t_n07/tenant/leak.jpg';
    const oPath = 'maintenanceTickets/t_n07/owner/leak.jpg';
    await assertSucceeds(uploadString(ref(tenant(), tPath), 'photo', 'raw', IMG));
    await assertFails(uploadString(ref(tenant(), tPath), 'swapped', 'raw', IMG));
    await assertSucceeds(uploadString(ref(owner(), oPath), 'photo', 'raw', IMG));
    await assertFails(uploadString(ref(owner(), oPath), 'swapped', 'raw', IMG));
  });

  it('hash-bound tenant receipts cannot be replaced after submission', async () => {
    const path = 'receipts/tenant_n07/sub_1_receipt.pdf';
    const meta = { customMetadata: { tenantId: 'tenant_n07', evidenceType: 'tenant_payment_receipt', receiptHash: 'a'.repeat(64) } };
    await assertSucceeds(uploadString(ref(tenant(), path), '%PDF-1.7 receipt', 'raw', { contentType: 'application/pdf', ...meta }));
    await assertFails(uploadString(ref(tenant(), path), '%PDF-1.7 other', 'raw', { contentType: 'application/pdf', ...meta }));
    await assertFails(deleteObject(ref(tenant(), path)));
  });

  it('N-18: Owner cannot upload to or read design_requests directly', async () => {
    await assertFails(uploadString(ref(owner(), 'design_requests/owner_n07/ref.jpg'), 'img', 'raw', IMG));
    await seed('design_requests/owner_n07/req_1/reference.jpg');
    await assertFails(getBytes(ref(owner(), 'design_requests/owner_n07/req_1/reference.jpg')));
    await assertFails(deleteObject(ref(owner(), 'design_requests/owner_n07/req_1/reference.jpg')));
  });

  it('N-18: ai_design_renders is closed to Owner and Admin browsers', async () => {
    await seed('ai_design_renders/owner_n07/render.png', 'image/png');
    await assertFails(getBytes(ref(owner(), 'ai_design_renders/owner_n07/render.png')));
    await assertFails(uploadString(ref(adminS(), 'ai_design_renders/owner_n07/new.png'), 'img', 'raw', { contentType: 'image/png' }));
  });

  // Residual (documented in the PR): the Admin catch-all `match /{collection}/{allPaths=**}` still ORs
  // admin write over these paths. Its exact text is pinned by scripts/harden-private-hr-storage.mjs,
  // so narrowing it is a separate pipeline change.
  it('control: Admin can still read submitted evidence', async () => {
    await seed('evidence/t_n07/after_1.jpg');
    await assertSucceeds(getBytes(ref(adminS(), 'evidence/t_n07/after_1.jpg')));
  });

  it('control: Admin catch-all still allows unrelated admin paths', async () => {
    await assertSucceeds(uploadString(ref(adminS(), 'marketing/banner.png'), 'img', 'raw', { contentType: 'image/png' }));
    await assertSucceeds(getBytes(ref(adminS(), 'marketing/banner.png')));
  });

  it('control: unassigned technician still cannot create ticket evidence', async () => {
    const other = actor('tech_other', { role: 'technician' });
    await assertFails(uploadString(ref(other, 'maintenanceTickets/t_n07/proofPhotos/x.jpg'), 'img', 'raw', IMG));
  });
});
