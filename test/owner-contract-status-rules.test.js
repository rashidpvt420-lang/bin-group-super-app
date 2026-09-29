// F-4 regression: contract status / signature fields are server-authored only.
// Before the fix an Owner could set status to "SIGNED", "Active" or "APPROVED" on
// their own contract (only exact "active"/"ACTIVE" was denied), spoofing signature
// state and making ownerSignContractAndQueuePdf short-circuit as "already signed".
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

const pendingContract = {
  ownerId: 'owner_f4',
  ownerUid: 'owner_f4',
  ownerEmail: 'owner-f4@example.com',
  status: 'PENDING_OWNER_SIGNATURE',
  contractStatus: 'PENDING_OWNER_SIGNATURE',
  ownerSigned: false,
  paymentStatus: 'NOT_DUE_UNTIL_OWNER_FINAL_SIGNATURE',
};

describe('F-4 owner contract status is server-authored', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('contracts/f4_contract', pendingContract);
  });
  after(async () => testEnv.cleanup());

  const ownerDb = () => testEnv.authenticatedContext('owner_f4', {
    role: 'owner', email: 'owner-f4@example.com', email_verified: true,
  }).firestore();

  for (const status of ['SIGNED', 'signed', 'Active', 'active', 'ACTIVE', 'APPROVED', 'READY_FOR_ACTIVATION', 'owner_signed']) {
    it(`Owner cannot set own contract status to ${JSON.stringify(status)}`, async () => {
      await assertFails(updateDoc(doc(ownerDb(), 'contracts/f4_contract'), { status, updatedAt: serverTimestamp() }));
    });
  }

  it('Owner cannot write acceptedAt or signedAt on own contract', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'contracts/f4_contract'), { signedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(ownerDb(), 'contracts/f4_contract'), { acceptedAt: serverTimestamp() }));
  });

  it('Owner cannot forge server signature evidence fields', async () => {
    await assertFails(updateDoc(doc(ownerDb(), 'contracts/f4_contract'), { ownerSigned: true }));
    await assertFails(updateDoc(doc(ownerDb(), 'contracts/f4_contract'), { 'signatureState.ownerSigned': true }));
  });

  it('Owner may still touch updatedAt only (no state change)', async () => {
    await assertSucceeds(updateDoc(doc(ownerDb(), 'contracts/f4_contract'), { updatedAt: serverTimestamp() }));
  });

  it('A different Owner cannot update the contract at all', async () => {
    const otherDb = testEnv.authenticatedContext('owner_other', { role: 'owner', email_verified: true }).firestore();
    await assertFails(updateDoc(doc(otherDb, 'contracts/f4_contract'), { updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(otherDb, 'contracts/f4_contract'), { status: 'SIGNED' }));
  });

  it('Contract managers keep their existing update path', async () => {
    await seed('users/admin_f4', { role: 'admin' });
    const adminDb = testEnv.authenticatedContext('admin_f4', { admin: true, role: 'admin' }).firestore();
    await assertSucceeds(updateDoc(doc(adminDb, 'contracts/f4_contract'), { status: 'TERMINATED', updatedAt: serverTimestamp() }));
  });
});
