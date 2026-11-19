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

  const seed = (path, seedData) => testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), path), { ...seedData });
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

  describe('technicians collection staffNumber tamper prevention', () => {
    const hrDb = () => testEnv.authenticatedContext('hr_staff_1', { role: 'hr_staff', email: 'hr1@example.com', email_verified: true }).firestore();

    it('denies HR clients creating or changing technician staff numbers but allows unrelated fields', async () => {
      await seed('technicians/tech_1', { uid: 'tech_1', name: 'Tech One', trade: 'HVAC', staffNumber: 10010, staffNumberStr: '10010' });

      await assertFails(updateDoc(doc(hrDb(), 'technicians/tech_1'), { staffNumber: 10099 }));
      await assertFails(updateDoc(doc(hrDb(), 'technicians/tech_1'), { staffNumberStr: '10099' }));
      await assertFails(setDoc(doc(hrDb(), 'technicians/tech_new'), { uid: 'tech_new', name: 'New', staffNumber: 10011 }));
      await assertSucceeds(updateDoc(doc(hrDb(), 'technicians/tech_1'), { trade: 'Plumbing' }));
    });

    it('denies MFA admin clients creating or changing technician staff numbers; legitimate admin writes still pass', async () => {
      await seed('technicians/tech_1', { uid: 'tech_1', name: 'Tech One', trade: 'HVAC', staffNumber: 10010, staffNumberStr: '10010', approvalStatus: 'APPROVED' });

      // Staff number forgery through the generic admin grant is closed.
      await assertFails(updateDoc(doc(adminDb(), 'technicians/tech_1'), { staffNumber: 10099 }));
      await assertFails(updateDoc(doc(adminDb(), 'technicians/tech_1'), { staffNumberStr: '10099' }));
      await assertFails(setDoc(doc(adminDb(), 'technicians/tech_admin_new'), { uid: 'tech_admin_new', name: 'New', staffNumber: 10012 }));
      await assertFails(setDoc(doc(adminDb(), 'technicians/tech_admin_new2'), { uid: 'tech_admin_new2', name: 'New', staffNumberStr: '10013' }));
      // Other protected readiness fields stay server-only for admins too.
      await assertFails(updateDoc(doc(adminDb(), 'technicians/tech_1'), { approvalStatus: 'SUSPENDED' }));

      // Legitimate admin writes on unprotected fields still pass via the technicians match.
      await assertSucceeds(updateDoc(doc(adminDb(), 'technicians/tech_1'), { trade: 'Electrical' }));
      await assertSucceeds(setDoc(doc(adminDb(), 'technicians/tech_admin_ok'), { uid: 'tech_admin_ok', name: 'Admin Created', trade: 'HVAC' }));
      await assertSucceeds(setDoc(doc(adminDb(), 'technicians/tech_1/deviceReadiness/gps'), { ok: true }));
      await assertSucceeds(getDoc(doc(adminDb(), 'technicians/tech_1')));
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
