import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';

let testEnv;

async function seedFirestore(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

async function seedStorage(path, body = 'server evidence', contentType = 'application/pdf') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await uploadString(ref(context.storage(), path), body, 'raw', { contentType });
  });
}

function context(uid, claims) {
  return testEnv.authenticatedContext(uid, claims).storage();
}

const pdf = { contentType: 'application/pdf' };
const image = { contentType: 'image/jpeg' };

describe('Phase 10 Storage full audit matrix', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
      storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
    await seedFirestore('maintenanceTickets/ticket_a', {
      ownerId: 'owner_a',
      tenantId: 'tenant_a',
      assignedTechnicianId: 'tech_a',
      status: 'ASSIGNED',
    });
    await seedFirestore('contracts/contract_a', { ownerId: 'owner_a', status: 'ACTIVE' });
    await seedFirestore('invoices/invoice_a', { ownerId: 'owner_a', status: 'ISSUED' });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('owner property documents are owner-created, immutable and not forgeable by browser Admin', async () => {
    const owner = context('owner_a', { role: 'owner' });
    const other = context('owner_b', { role: 'owner' });
    const admin = context('admin_a', { role: 'admin', admin: true });
    const anon = testEnv.unauthenticatedContext().storage();
    const path = 'owners/owner_a/property_documents/floor_plans/1700000000000_plan.pdf';

    await assertFails(uploadString(ref(anon, path), 'plan', 'raw', pdf));
    await assertFails(uploadString(ref(other, path), 'plan', 'raw', pdf));
    await assertFails(uploadString(ref(admin, path), 'admin forged', 'raw', pdf));
    await assertSucceeds(uploadString(ref(owner, path), 'plan', 'raw', pdf));
    await assertFails(uploadString(ref(owner, path), 'overwrite', 'raw', pdf));
    await assertSucceeds(getBytes(ref(owner, path)));
    await assertSucceeds(getBytes(ref(admin, path)));
  });

  it('onboarding property proof and Emirates ID require owner/intake/docType metadata and are immutable', async () => {
    const owner = context('owner_a', { role: 'owner' });
    const other = context('owner_b', { role: 'owner' });
    const admin = context('admin_a', { role: 'admin', admin: true });

    for (const docType of ['propertyProof', 'emiratesId']) {
      const path = `onboarding-proof/owner_a/intake_a/${docType}/1700000000000_${docType}.pdf`;
      const valid = {
        contentType: 'application/pdf',
        customMetadata: {
          ownerUid: 'owner_a',
          intakeId: 'intake_a',
          docType,
        },
      };
      await assertFails(uploadString(ref(other, path), 'proof', 'raw', valid));
      await assertFails(uploadString(ref(admin, path), 'proof', 'raw', valid));
      await assertFails(uploadString(ref(owner, path), 'proof', 'raw', {
        contentType: 'application/pdf',
        customMetadata: { ownerUid: 'owner_a', intakeId: 'wrong', docType },
      }));
      await assertSucceeds(uploadString(ref(owner, path), 'proof', 'raw', valid));
      await assertFails(uploadString(ref(owner, path), 'overwrite', 'raw', valid));
      await assertSucceeds(getBytes(ref(owner, path)));
      await assertSucceeds(getBytes(ref(admin, path)));
    }
  });

  it('owner listing/property photos are create-only, image-only and metadata-bound', async () => {
    const owner = context('owner_a', { role: 'owner' });
    const other = context('owner_b', { role: 'owner' });
    const path = 'home-listing-media/owner_a/request_a/property.jpg';
    const valid = {
      contentType: 'image/jpeg',
      customMetadata: {
        ownerUid: 'owner_a',
        listingRequestId: 'request_a',
        evidenceType: 'home_listing_photo',
      },
    };
    await assertFails(uploadString(ref(other, path), 'jpg', 'raw', valid));
    await assertFails(uploadString(ref(owner, path), 'pdf', 'raw', { ...valid, contentType: 'application/pdf' }));
    await assertSucceeds(uploadString(ref(owner, path), 'jpg', 'raw', valid));
    await assertFails(uploadString(ref(owner, path), 'replace', 'raw', valid));
  });

  it('Technician before/after photos are assigned-ticket, image-only and create-only', async () => {
    const tech = context('tech_a', { role: 'technician' });
    const otherTech = context('tech_b', { role: 'technician' });
    const owner = context('owner_a', { role: 'owner' });

    for (const file of ['before_work_1.jpg', 'after_work_1.jpg']) {
      const path = `maintenanceTickets/ticket_a/proofPhotos/${file}`;
      await assertFails(uploadString(ref(otherTech, path), 'image', 'raw', image));
      await assertFails(uploadString(ref(tech, path), 'not image', 'raw', pdf));
      await assertSucceeds(uploadString(ref(tech, path), 'image', 'raw', image));
      await assertFails(uploadString(ref(tech, path), 'overwrite', 'raw', image));
      await assertSucceeds(getBytes(ref(owner, path)));
    }

    await assertFails(uploadString(
      ref(tech, 'maintenanceTickets/ticket_a/completionPhotos/legacy.jpg'),
      'legacy bypass',
      'raw',
      image,
    ));
  });

  it('contracts and invoices are server-written while authorized participants retain read access', async () => {
    await seedStorage('contracts/contract_a/agreement.pdf');
    await seedStorage('invoices/invoice_a/invoice.pdf');

    const owner = context('owner_a', { role: 'owner' });
    const admin = context('admin_a', { role: 'admin', admin: true });
    const other = context('owner_b', { role: 'owner' });

    await assertSucceeds(getBytes(ref(owner, 'contracts/contract_a/agreement.pdf')));
    await assertSucceeds(getBytes(ref(owner, 'invoices/invoice_a/invoice.pdf')));
    await assertFails(getBytes(ref(other, 'contracts/contract_a/agreement.pdf')));
    await assertFails(getBytes(ref(other, 'invoices/invoice_a/invoice.pdf')));

    for (const path of ['contracts/contract_a/forged.pdf', 'invoices/invoice_a/forged.pdf']) {
      await assertFails(uploadString(ref(owner, path), 'forged', 'raw', pdf));
      await assertFails(uploadString(ref(admin, path), 'forged', 'raw', pdf));
    }
  });

  it('Broker KYC evidence is broker-scoped, typed and immutable; legacy KYC channel is closed', async () => {
    const broker = context('broker_a', { role: 'broker' });
    const other = context('broker_b', { role: 'broker' });
    const admin = context('admin_a', { role: 'admin', admin: true });
    const path = 'brokerDocuments/broker_a/emirates_id/id.pdf';
    const metadata = {
      contentType: 'application/pdf',
      customMetadata: {
        brokerId: 'broker_a',
        documentType: 'emirates_id',
      },
    };

    await assertFails(uploadString(ref(other, path), 'id', 'raw', metadata));
    await assertSucceeds(uploadString(ref(broker, path), 'id', 'raw', metadata));
    await assertFails(uploadString(ref(broker, path), 'overwrite', 'raw', metadata));
    await assertSucceeds(getBytes(ref(admin, path)));

    for (const db of [broker, admin]) {
      await assertFails(uploadString(ref(db, 'kyc_documents/broker_a-passport.pdf'), 'legacy', 'raw', pdf));
    }
  });

  it('staff certificates are staff/HR scoped and immutable while private HR bytes remain server-only', async () => {
    const staff = context('staff_a', { role: 'technician' });
    const other = context('staff_b', { role: 'technician' });
    const hr = context('hr_a', { role: 'hr_manager' });
    const admin = context('admin_a', { role: 'admin', admin: true });
    const certificate = 'staffDocuments/staff_a/trade_certificate/1700000000000-certificate.pdf';

    await assertFails(uploadString(ref(other, certificate), 'cert', 'raw', pdf));
    await assertSucceeds(uploadString(ref(staff, certificate), 'cert', 'raw', pdf));
    await assertFails(uploadString(ref(staff, certificate), 'overwrite', 'raw', pdf));
    await assertSucceeds(getBytes(ref(hr, certificate)));

    await assertFails(uploadString(ref(hr, 'hrDocuments/staff_a/legacy.pdf'), 'legacy', 'raw', pdf));
    for (const db of [staff, hr, admin]) {
      await assertFails(uploadString(ref(db, 'privateHrDocuments/staff_a/passport.pdf'), 'private', 'raw', pdf));
      await assertFails(getBytes(ref(db, 'privateHrDocuments/staff_a/passport.pdf')));
    }
  });
});
