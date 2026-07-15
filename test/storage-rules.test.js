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

  it('contract and invoice email access requires verified email claims', async () => {
    const adminContext = testEnv.authenticatedContext('admin_user', {
      admin: true,
      role: 'admin',
      email: 'admin@example.com',
      email_verified: true,
    });
    const adminDb = adminContext.firestore();
    await setDoc(doc(adminDb, 'contracts/contract_email'), {
      ownerId: 'different_owner',
      ownerEmail: 'owner@example.com',
    });
    await setDoc(doc(adminDb, 'invoices/invoice_email'), {
      ownerId: 'different_owner',
      recipientEmail: 'owner@example.com',
    });

    const adminStorage = adminContext.storage();
    await assertSucceeds(uploadString(
      ref(adminStorage, 'contracts/contract_email/contract.pdf'),
      'contract',
      'raw',
      { contentType: 'application/pdf' },
    ));
    await assertSucceeds(uploadString(
      ref(adminStorage, 'invoices/invoice_email/invoice.pdf'),
      'invoice',
      'raw',
      { contentType: 'application/pdf' },
    ));

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
});
