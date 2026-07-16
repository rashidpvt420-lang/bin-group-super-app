import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

async function seed(path, data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), path), data);
  });
}

describe('Broker KYC security rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it('denies direct Broker writes to raw KYC fields on the public user profile', async () => {
    await seed('users/broker_a', {
      uid: 'broker_a',
      role: 'broker',
      status: 'active',
      displayName: 'Broker A',
      reraStatus: 'NOT_SUBMITTED',
      reraVerified: false,
    });

    const brokerDb = testEnv.authenticatedContext('broker_a', {
      role: 'broker',
      email_verified: true,
    }).firestore();

    await assertFails(updateDoc(doc(brokerDb, 'users/broker_a'), {
      reraLicense: 'RERA-FORGED',
      reraStatus: 'PENDING',
      updatedAt: new Date().toISOString(),
    }));
    await assertFails(updateDoc(doc(brokerDb, 'users/broker_a'), {
      bankIban: 'AE000000000000000000000',
      iban: 'AE000000000000000000000',
      updatedAt: new Date().toISOString(),
    }));
  });

  it('allows only the owning broker and authorised admins to read the private KYC vault', async () => {
    await seed('users/broker_a', { uid: 'broker_a', role: 'broker', status: 'active' });
    await seed('users/broker_b', { uid: 'broker_b', role: 'broker', status: 'active' });
    await seed('users/admin_user', { uid: 'admin_user', role: 'admin', status: 'active', suspended: false });
    await seed('broker_kyc_profiles/broker_a', {
      uid: 'broker_a',
      reraLicense: 'RERA-PRIVATE',
      bankIban: 'AE000000000000000000000',
    });

    const brokerADb = testEnv.authenticatedContext('broker_a', { role: 'broker' }).firestore();
    const brokerBDb = testEnv.authenticatedContext('broker_b', { role: 'broker' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore();

    await assertSucceeds(getDoc(doc(brokerADb, 'broker_kyc_profiles/broker_a')));
    await assertFails(getDoc(doc(brokerBDb, 'broker_kyc_profiles/broker_a')));
    await assertSucceeds(getDoc(doc(adminDb, 'broker_kyc_profiles/broker_a')));
  });

  it('denies all client writes to Broker KYC and rate-limit documents', async () => {
    await seed('users/broker_a', { uid: 'broker_a', role: 'broker', status: 'active' });
    await seed('users/admin_user', { uid: 'admin_user', role: 'admin', status: 'active', suspended: false });
    await seed('broker_kyc_profiles/broker_a', { uid: 'broker_a', brokerKycStatus: 'INCOMPLETE' });

    const brokerDb = testEnv.authenticatedContext('broker_a', { role: 'broker' }).firestore();
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true, role: 'admin' }).firestore();

    await assertFails(updateDoc(doc(brokerDb, 'broker_kyc_profiles/broker_a'), {
      brokerKycStatus: 'APPROVED',
    }));
    await assertFails(setDoc(doc(brokerDb, 'broker_kyc_submission_limits/broker_a'), { count: 0 }));
    await assertFails(updateDoc(doc(adminDb, 'broker_kyc_profiles/broker_a'), {
      brokerKycStatus: 'APPROVED',
    }));
  });
});
