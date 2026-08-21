import './public-launch-evidence-security-rules.test.js';
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import fs from 'node:fs';
import admin from 'firebase-admin';

// Initialize firebase-admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'bin-group-57c60' });
}
const adminDb = admin.firestore();

// Import the function handler from compiled functions
import { runVerifyPublicProof } from '../functions/lib/proofVerification.js';

let testEnv;

describe('Invoice Verification Security & Function Authority', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
    // Clear rate limits collection in admin SDK too
    const rateLimitsSnap = await adminDb.collection('publicProofVerificationRateLimits').get();
    const batch = adminDb.batch();
    rateLimitsSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('unauthenticated direct registry read is denied', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(unauthDb, 'invoice_registry/some_hash')));
  });

  it('authenticated non-privileged direct registry read is denied', async () => {
    const tenantDb = testEnv.authenticatedContext('tenant_user', {
      role: 'tenant',
      email: 'tenant@example.test',
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(tenantDb, 'invoice_registry/some_hash')));
  });

  it('authenticated admin direct registry read is denied', async () => {
    const adminDbClient = testEnv.authenticatedContext('admin_user', {
      role: 'admin',
      admin: true,
      email_verified: true,
    }).firestore();
    await assertFails(getDoc(doc(adminDbClient, 'invoice_registry/some_hash')));
  });

  it('direct registry writes are denied for everyone', async () => {
    const adminDbClient = testEnv.authenticatedContext('admin_user', {
      role: 'admin',
      admin: true,
      email_verified: true,
    }).firestore();
    await assertFails(setDoc(doc(adminDbClient, 'invoice_registry/some_hash'), { verified: true }));
    await assertFails(deleteDoc(doc(adminDbClient, 'invoice_registry/some_hash')));
  });

  it('valid proof returns only {verified: true} through the callable', async () => {
    const hash = 'a'.repeat(64); // 64 hex characters
    await adminDb.collection('invoice_registry').doc(hash).set({
      amount: 1000,
      payer: 'tenant_1',
      status: 'PAID',
    });

    const response = await runVerifyPublicProof(
      { hash: hash, type: 'invoice' },
      null, // auth
      { ip: '1.2.3.4', headers: { 'user-agent': 'mocha-test' } },
      adminDb
    );

    assert.deepEqual(response, { verified: true });
  });

  it('invalid proof returns {verified: false} without leaking info', async () => {
    const hash = 'b'.repeat(64);
    const response = await runVerifyPublicProof(
      { hash: hash, type: 'invoice' },
      null, // auth
      { ip: '1.2.3.4', headers: { 'user-agent': 'mocha-test' } },
      adminDb
    );

    assert.deepEqual(response, { verified: false });
  });

  it('requests are rate-limited after exceeding maximum limit', async () => {
    const hash = 'c'.repeat(64);
    const mockRequest = { ip: '9.9.9.9', headers: { 'user-agent': 'rate-limit-test' } };

    // Fire 20 requests successfully (limit is 20)
    for (let i = 0; i < 20; i++) {
      await runVerifyPublicProof(
        { hash: hash, type: 'invoice' },
        null,
        mockRequest,
        adminDb
      );
    }

    // 21st request should be rejected with resource-exhausted
    await assert.rejects(
      async () => {
        await runVerifyPublicProof(
          { hash: hash, type: 'invoice' },
          null,
          mockRequest,
          adminDb
        );
      },
      (err) => {
        assert.equal(err.code, 'resource-exhausted');
        return true;
      }
    );
  });
});
