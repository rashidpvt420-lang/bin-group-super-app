import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;

describe('Canonical profile workflow rules', () => {
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

  it('technician can accept only their own staff agreement using the narrow field set', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'staffAgreements/tech_a'), {
      uid: 'tech_a',
      status: 'pending',
      agreementText: 'BIN GROUP staff acknowledgement',
    });

    const techDb = testEnv.authenticatedContext('tech_a', { role: 'technician' }).firestore();
    await assertSucceeds(getDoc(doc(techDb, 'staffAgreements/tech_a')));
    await assertSucceeds(updateDoc(doc(techDb, 'staffAgreements/tech_a'), {
      status: 'accepted',
      acceptedAt: new Date().toISOString(),
      acceptedBy: 'tech_a',
    }));

    await assertFails(updateDoc(doc(techDb, 'staffAgreements/tech_a'), {
      status: 'accepted',
      acceptanceMethod: 'client_injected_field',
    }));

    const otherTechDb = testEnv.authenticatedContext('tech_b', { role: 'technician' }).firestore();
    await assertFails(getDoc(doc(otherTechDb, 'staffAgreements/tech_a')));
    await assertFails(updateDoc(doc(otherTechDb, 'staffAgreements/tech_a'), {
      status: 'accepted',
      acceptedBy: 'tech_b',
    }));
  });

  it('owner can publish announcements only for a property they own', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'properties/prop_owned'), { ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'properties/prop_other'), { ownerId: 'owner_b' });

    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'announcements/notice_owned'), {
      ownerId: 'owner_a',
      propertyId: 'prop_owned',
      title: 'Water shutdown notice',
      body: 'Scheduled maintenance',
      published: true,
    }));
    await assertFails(setDoc(doc(ownerDb, 'announcements/notice_other'), {
      ownerId: 'owner_a',
      propertyId: 'prop_other',
      title: 'Unauthorized notice',
      body: 'Blocked',
      published: true,
    }));
  });

  it('owner can approve amenity and visitor requests only inside their property', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'properties/prop_owned'), { ownerId: 'owner_a' });
    await setDoc(doc(adminDb, 'properties/prop_other'), { ownerId: 'owner_b' });
    await setDoc(doc(adminDb, 'amenityBookings/booking_owned'), { propertyId: 'prop_owned', tenantUid: 'tenant_a', status: 'pending' });
    await setDoc(doc(adminDb, 'amenityBookings/booking_other'), { propertyId: 'prop_other', tenantUid: 'tenant_b', status: 'pending' });
    await setDoc(doc(adminDb, 'visitorParkingRequests/parking_owned'), { propertyId: 'prop_owned', tenantUid: 'tenant_a', unitId: 'unit_a', status: 'pending' });
    await setDoc(doc(adminDb, 'visitorParkingRequests/parking_other'), { propertyId: 'prop_other', tenantUid: 'tenant_b', unitId: 'unit_b', status: 'pending' });

    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    await assertSucceeds(updateDoc(doc(ownerDb, 'amenityBookings/booking_owned'), { status: 'approved' }));
    await assertFails(updateDoc(doc(ownerDb, 'amenityBookings/booking_other'), { status: 'approved' }));
    await assertSucceeds(updateDoc(doc(ownerDb, 'visitorParkingRequests/parking_owned'), { status: 'approved' }));
    await assertFails(updateDoc(doc(ownerDb, 'visitorParkingRequests/parking_other'), { status: 'approved' }));
  });

  it('owner tenant directory can query tenant records but cannot list the global user directory', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'tenants/tenant_a'), {
      tenantId: 'tenant_a',
      ownerId: 'owner_a',
      propertyId: 'prop_owned',
      displayName: 'Linked Tenant',
    });
    await setDoc(doc(adminDb, 'users/tenant_a'), {
      role: 'tenant',
      ownerId: 'owner_a',
      propertyId: 'prop_owned',
      displayName: 'Global User Directory Tenant',
    });

    const ownerDb = testEnv.authenticatedContext('owner_a', { role: 'owner' }).firestore();
    await assertSucceeds(getDocs(query(collection(ownerDb, 'tenants'), where('ownerId', '==', 'owner_a'))));
    await assertFails(getDocs(query(collection(ownerDb, 'users'), where('ownerId', '==', 'owner_a'))));
  });

  it('broker can submit an attributed referral but cannot browse private owner properties', async () => {
    const adminDb = testEnv.authenticatedContext('admin_user', { admin: true }).firestore();
    await setDoc(doc(adminDb, 'users/admin_user'), { role: 'admin' });
    await setDoc(doc(adminDb, 'properties/private_owner_property'), {
      ownerId: 'owner_a',
      propertyName: 'Private Owner Tower',
    });

    const brokerDb = testEnv.authenticatedContext('broker_a', { role: 'broker', email: 'broker-a@example.com' }).firestore();
    await assertFails(getDocs(collection(brokerDb, 'properties')));
    await assertSucceeds(setDoc(doc(brokerDb, 'referrals/referral_a'), {
      brokerId: 'broker_a',
      brokerUid: 'broker_a',
      brokerEmail: 'broker-a@example.com',
      clientName: 'Owner Prospect',
      propertyName: 'Provided Property Name',
      propertyReferenceId: 'OWNER-PROVIDED-REF-001',
      propertyReferenceVerification: 'PENDING_ADMIN_MATCH',
      attributionId: 'broker_referral_broker_a_referral_a',
      status: 'submitted',
    }));
    await assertSucceeds(getDoc(doc(brokerDb, 'referrals/referral_a')));

    const otherBrokerDb = testEnv.authenticatedContext('broker_b', { role: 'broker' }).firestore();
    await assertFails(getDoc(doc(otherBrokerDb, 'referrals/referral_a')));
  });
});
