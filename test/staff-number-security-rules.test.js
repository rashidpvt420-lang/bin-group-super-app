// Staff number security rules (Rashid, 18 Nov 2026).
// system_counters is server-only. Clients can never read or write counter docs.
// users/{userId} documents cannot have staffNumber or staffNumberStr set or changed by any client.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const ADMIN = { role: 'admin', admin: true, email: 'admin-staff@example.com', email_verified: true };
const USER = 'staff_user_1';

describe('Staff number and system_counters security rules', () => {
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
    await testEnv?.cleanup();
  });

  const unauthDb = () => testEnv.unauthenticatedContext().firestore();
  const userDb = () => testEnv.authenticatedContext(USER, { email: 'staff1@example.com', email_verified: true, role: 'staff' }).firestore();
  const adminDb = () => testEnv.authenticatedContext('admin_staff', { ...ADMIN, ...MFA }).firestore();

  const seed = (path, data) => testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), path), data);
  });

  describe('system_counters server-only protection', () => {
    it('denies read and write on system_counters to unauthenticated, user, and admin clients', async () => {
      await seed('system_counters/staff_number', { current: 10001, updatedAt: '2026-11-18T00:00:00Z' });

      // Unauthenticated
      await assertFails(getDoc(doc(unauthDb(), 'system_counters/staff_number')));
      await assertFails(setDoc(doc(unauthDb(), 'system_counters/staff_number'), { current: 99999 }));

      // Authenticated User
      await assertFails(getDoc(doc(userDb(), 'system_counters/staff_number')));
      await assertFails(setDoc(doc(userDb(), 'system_counters/staff_number'), { current: 99999 }));
      await assertFails(updateDoc(doc(userDb(), 'system_counters/staff_number'), { current: 99999 }));
      await assertFails(deleteDoc(doc(userDb(), 'system_counters/staff_number')));

      // Admin with MFA can read, but can NEVER write or change it
      await assertSucceeds(getDoc(doc(adminDb(), 'system_counters/staff_number')));
      await assertFails(setDoc(doc(adminDb(), 'system_counters/staff_number'), { current: 99999 }));
      await assertFails(updateDoc(doc(adminDb(), 'system_counters/staff_number'), { current: 99999 }));
      await assertFails(deleteDoc(doc(adminDb(), 'system_counters/staff_number')));
    });
  });

  describe('users collection staffNumber tamper prevention', () => {
    it('denies client creating a user with staffNumber or staffNumberStr', async () => {
      // User self-creation attempt with staffNumber
      await assertFails(setDoc(doc(userDb(), `users/${USER}`), {
        uid: USER,
        email: 'staff1@example.com',
        role: 'tenant',
        staffNumber: 10001,
      }));

      // User self-creation attempt with staffNumberStr
      await assertFails(setDoc(doc(userDb(), `users/${USER}`), {
        uid: USER,
        email: 'staff1@example.com',
        role: 'tenant',
        staffNumberStr: '10001',
      }));

      // Admin creation attempt with staffNumber
      await assertFails(setDoc(doc(adminDb(), 'users/new_staff_uid'), {
        uid: 'new_staff_uid',
        email: 'newstaff@example.com',
        role: 'staff',
        staffNumber: 10002,
      }));
    });

    it('denies client updating staffNumber or staffNumberStr on existing user', async () => {
      await seed(`users/${USER}`, {
        uid: USER,
        email: 'staff1@example.com',
        role: 'staff',
        staffNumber: 10001,
        staffNumberStr: '10001',
        language: 'en',
      });

      // Self-update attempt to overwrite staffNumber
      await assertFails(updateDoc(doc(userDb(), `users/${USER}`), {
        staffNumber: 10099,
      }));

      // Self-update attempt to overwrite staffNumberStr
      await assertFails(updateDoc(doc(userDb(), `users/${USER}`), {
        staffNumberStr: '10099',
      }));

      // Admin client update attempt to overwrite staffNumber
      await assertFails(updateDoc(doc(adminDb(), `users/${USER}`), {
        staffNumber: 10099,
      }));

      // Non-staffNumber self update succeeds
      await assertSucceeds(updateDoc(doc(userDb(), `users/${USER}`), {
        language: 'ar',
      }));
    });
  });
});
