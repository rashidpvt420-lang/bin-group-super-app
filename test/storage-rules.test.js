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

describe('Storage Security Rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
      },
      storage: {
        rules: fs.readFileSync('storage.rules', 'utf8'),
      },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.clearStorage();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('design payment receipts are server-write-only even for Admin browsers', async () => {
    const path = 'design-payment-receipts/design_1/receipt_hash';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(), path), '%PDF-1.7 receipt', 'raw', { contentType: 'application/pdf' });
    });
    for (const [uid, claims] of [['owner_a', { role: 'owner' }], ['tenant_a', { role: 'tenant' }], ['admin_a', { role: 'admin', admin: true }]]) {
      const storage = testEnv.authenticatedContext(uid, claims).storage();
      await assertFails(uploadString(ref(storage, path), 'forged receipt', 'raw', { contentType: 'application/pdf' }));
      await assertFails(uploadString(ref(storage, `${path}_new`), 'forged receipt', 'raw', { contentType: 'application/pdf' }));
    }
    const adminStorage = testEnv.authenticatedContext('admin_a', { role: 'admin', admin: true }).storage();
    await assertSucceeds(getBytes(ref(adminStorage, path)));
  });

  it('contract and invoice email access requires verified email claims', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const serverDb = context.firestore();
      await setDoc(doc(serverDb, 'contracts/contract_email'), {
        ownerId: 'different_owner',
        ownerEmail: 'owner@example.com',
      });
      await setDoc(doc(serverDb, 'invoices/invoice_email'), {
        ownerId: 'different_owner',
        recipientEmail: 'owner@example.com',
      });
      const serverStorage = context.storage();
      await uploadString(
        ref(serverStorage, 'contracts/contract_email/contract.pdf'),
        'contract',
        'raw',
        { contentType: 'application/pdf' },
      );
      await uploadString(
        ref(serverStorage, 'invoices/invoice_email/invoice.pdf'),
        'invoice',
        'raw',
        { contentType: 'application/pdf' },
      );
    });

    const unverifiedStorage = testEnv.authenticatedContext('unverified_owner', {
      role: 'owner',
      email: 'owner@example.com',
      email_verified: false,
    }).storage();
    const verifiedStorage = testEnv.authenticatedContext('verified_owner', {
      role: 'owner',
      email: 'owner@example.com',
      email_verified: true,
    }).storage();

    await assertFails(getBytes(ref(unverifiedStorage, 'contracts/contract_email/contract.pdf')));
    await assertFails(getBytes(ref(unverifiedStorage, 'invoices/invoice_email/invoice.pdf')));
    await assertSucceeds(getBytes(ref(verifiedStorage, 'contracts/contract_email/contract.pdf')));
    await assertSucceeds(getBytes(ref(verifiedStorage, 'invoices/invoice_email/invoice.pdf')));
  });

  it('tenant receipts require owner path, bounded MIME and immutable evidence metadata', async () => {
    const tenantStorage = testEnv.authenticatedContext('tenant_a', {
      role: 'tenant',
    }).storage();
    const otherTenantStorage = testEnv.authenticatedContext('tenant_b', {
      role: 'tenant',
    }).storage();
    const receiptPath = 'receipts/tenant_a/proof.pdf';
    const validMetadata = {
      contentType: 'application/pdf',
      customMetadata: {
        tenantId: 'tenant_a',
        evidenceType: 'tenant_payment_receipt',
        receiptHash: 'a'.repeat(64),
      },
    };

    await assertFails(uploadString(ref(otherTenantStorage, receiptPath), 'proof', 'raw', validMetadata));
    await assertFails(uploadString(
      ref(tenantStorage, receiptPath),
      'proof',
      'raw',
      {
        contentType: 'application/pdf',
        customMetadata: {
          tenantId: 'tenant_a',
          evidenceType: 'tenant_payment_receipt',
          receiptHash: 'not-a-sha256',
        },
      },
    ));
    await assertSucceeds(uploadString(ref(tenantStorage, receiptPath), 'proof', 'raw', validMetadata));
  });

  it('owner document uploads isolate title-deed and Emirates-ID style evidence by owner', async () => {
    const ownerAStorage = testEnv.authenticatedContext('owner_a', { role: 'owner' }).storage();
    const ownerBStorage = testEnv.authenticatedContext('owner_b', { role: 'owner' }).storage();
    const unauthStorage = testEnv.unauthenticatedContext().storage();
    const titlePath = 'owners/owner_a/properties/property_a/title_deed.pdf';
    const emiratesPath = 'owners/owner_a/identity/emirates_id.pdf';

    await assertSucceeds(uploadString(ref(ownerAStorage, titlePath), 'title deed', 'raw', { contentType: 'application/pdf' }));
    await assertSucceeds(uploadString(ref(ownerAStorage, emiratesPath), 'identity', 'raw', { contentType: 'application/pdf' }));
    await assertFails(getBytes(ref(ownerBStorage, titlePath)));
    await assertFails(uploadString(ref(ownerBStorage, titlePath), 'forged', 'raw', { contentType: 'application/pdf' }));
    await assertFails(getBytes(ref(unauthStorage, emiratesPath)));
    await assertFails(uploadString(ref(ownerAStorage, 'owners/owner_a/identity/payload.exe'), 'x', 'raw', { contentType: 'application/octet-stream' }));
  });

  it('technician before and after evidence is image-only and bound to the assigned ticket', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'maintenanceTickets/ticket_evidence'), {
        ownerId: 'owner_a',
        tenantId: 'tenant_a',
        assignedTechnicianId: 'tech_a',
      });
    });

    const techAStorage = testEnv.authenticatedContext('tech_a', { role: 'technician' }).storage();
    const techBStorage = testEnv.authenticatedContext('tech_b', { role: 'technician' }).storage();
    const ownerStorage = testEnv.authenticatedContext('owner_a', { role: 'owner' }).storage();

    await assertSucceeds(uploadString(
      ref(techAStorage, 'maintenanceTickets/ticket_evidence/proofPhotos/before.jpg'),
      'image',
      'raw',
      { contentType: 'image/jpeg' },
    ));
    await assertSucceeds(uploadString(
      ref(techAStorage, 'maintenanceTickets/ticket_evidence/completionPhotos/after.jpg'),
      'image',
      'raw',
      { contentType: 'image/jpeg' },
    ));
    await assertFails(uploadString(
      ref(techBStorage, 'maintenanceTickets/ticket_evidence/completionPhotos/forged.jpg'),
      'image',
      'raw',
      { contentType: 'image/jpeg' },
    ));
    await assertFails(uploadString(
      ref(techAStorage, 'maintenanceTickets/ticket_evidence/completionPhotos/not-image.pdf'),
      'pdf',
      'raw',
      { contentType: 'application/pdf' },
    ));
    await assertSucceeds(getBytes(ref(ownerStorage, 'maintenanceTickets/ticket_evidence/completionPhotos/after.jpg')));
  });

  it('Broker KYC uploads are owner-bound, metadata-bound and immutable to the Broker', async () => {
    const brokerAStorage = testEnv.authenticatedContext('broker_a', { role: 'broker' }).storage();
    const brokerBStorage = testEnv.authenticatedContext('broker_b', { role: 'broker' }).storage();
    const path = 'brokerDocuments/broker_a/emirates_id/evidence.pdf';
    const valid = {
      contentType: 'application/pdf',
      customMetadata: {
        brokerId: 'broker_a',
        documentType: 'emirates_id',
      },
    };

    await assertSucceeds(uploadString(ref(brokerAStorage, path), 'kyc', 'raw', valid));
    await assertFails(uploadString(ref(brokerAStorage, path), 'replacement', 'raw', valid));
    await assertFails(getBytes(ref(brokerBStorage, path)));
    await assertFails(uploadString(
      ref(brokerAStorage, 'brokerDocuments/broker_a/emirates_id/bad.pdf'),
      'kyc',
      'raw',
      {
        contentType: 'application/pdf',
        customMetadata: {
          brokerId: 'broker_b',
          documentType: 'emirates_id',
        },
      },
    ));
  });

  it('temporary KYC evidence is isolated to the authenticated uploader', async () => {
    const ownerAStorage = testEnv.authenticatedContext('owner_a', { role: 'owner' }).storage();
    const ownerBStorage = testEnv.authenticatedContext('owner_b', { role: 'owner' }).storage();
    const path = 'temp_kyc/owner_a/title_deed.pdf';

    await assertSucceeds(uploadString(ref(ownerAStorage, path), 'proof', 'raw', { contentType: 'application/pdf' }));
    await assertSucceeds(getBytes(ref(ownerAStorage, path)));
    await assertFails(getBytes(ref(ownerBStorage, path)));
    await assertFails(uploadString(ref(ownerBStorage, path), 'forged', 'raw', { contentType: 'application/pdf' }));
  });

  it('invoice evidence is server/Admin-authored and participant reads remain scoped', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'invoices/invoice_owner_a'), {
        ownerId: 'owner_a',
        amount: 100,
      });
      await uploadString(
        ref(context.storage(), 'invoices/invoice_owner_a/invoice.pdf'),
        'invoice',
        'raw',
        { contentType: 'application/pdf' },
      );
    });

    const ownerAStorage = testEnv.authenticatedContext('owner_a', { role: 'owner' }).storage();
    const ownerBStorage = testEnv.authenticatedContext('owner_b', { role: 'owner' }).storage();
    const unauthStorage = testEnv.unauthenticatedContext().storage();

    await assertSucceeds(getBytes(ref(ownerAStorage, 'invoices/invoice_owner_a/invoice.pdf')));
    await assertFails(getBytes(ref(ownerBStorage, 'invoices/invoice_owner_a/invoice.pdf')));
    await assertFails(getBytes(ref(unauthStorage, 'invoices/invoice_owner_a/invoice.pdf')));
    await assertFails(uploadString(
      ref(ownerAStorage, 'invoices/invoice_owner_a/forged.pdf'),
      'invoice',
      'raw',
      { contentType: 'application/pdf' },
    ));
  });

  it('private HR documents are inaccessible to every browser role including Admin and HR', async () => {
    const path = 'privateHrDocuments/staff_a/contract.pdf';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(), path), 'private', 'raw', { contentType: 'application/pdf' });
    });

    for (const [uid, claims] of [
      ['staff_a', { role: 'technician' }],
      ['hr_a', { role: 'hr_admin' }],
      ['admin_a', { role: 'admin', admin: true }],
    ]) {
      const storage = testEnv.authenticatedContext(uid, claims).storage();
      await assertFails(getBytes(ref(storage, path)));
      await assertFails(uploadString(ref(storage, path), 'rewrite', 'raw', { contentType: 'application/pdf' }));
      await assertFails(uploadString(ref(storage, `privateHrDocuments/staff_a/new-${uid}.pdf`), 'new', 'raw', { contentType: 'application/pdf' }));
    }
  });

});
