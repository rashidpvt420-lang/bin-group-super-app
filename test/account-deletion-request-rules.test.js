// Google Play account deletion: accountDeletionRequests/{uid} is create-only for the signed-in
// user, bound to their own uid, server-timestamped, and never auto-deletes anything.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const ADMIN = { role: 'admin', admin: true, email: 'admin-del@example.com', email_verified: true };
const USER = 'del_user_a';
const OTHER = 'del_user_b';
const claims = (email) => ({ email, email_verified: true });

const validRequest = (uid = USER, email = 'a@example.com') => ({
  userId: uid,
  email,
  notes: 'Please delete my account',
  status: 'pending_review',
  source: 'in_app_account_deletion',
  requestedAt: serverTimestamp(),
});

describe('accountDeletionRequests rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => { await testEnv.clearFirestore(); });
  after(async () => testEnv.cleanup());

  const userDb = (uid, email) => testEnv.authenticatedContext(uid, claims(email)).firestore();
  const adminDb = () => testEnv.authenticatedContext('admin_del', { ...ADMIN, ...MFA }).firestore();
  const seed = async (uid = USER) => testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `accountDeletionRequests/${uid}`), {
      userId: uid, email: 'a@example.com', notes: '', status: 'pending_review', source: 'in_app_account_deletion', requestedAt: new Date(),
    });
  });

  it('lets a signed-in user create only their own pending request', async () => {
    await assertSucceeds(setDoc(doc(userDb(USER, 'a@example.com'), `accountDeletionRequests/${USER}`), validRequest()));
  });

  it('rejects anonymous callers', async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, `accountDeletionRequests/${USER}`), validRequest()));
  });

  it('rejects a request filed under, or on behalf of, another uid', async () => {
    const db = userDb(USER, 'a@example.com');
    await assertFails(setDoc(doc(db, `accountDeletionRequests/${OTHER}`), validRequest(OTHER)));
    await assertFails(setDoc(doc(db, `accountDeletionRequests/${USER}`), validRequest(OTHER)));
    await assertFails(setDoc(doc(db, 'accountDeletionRequests/random-id'), validRequest()));
  });

  it('rejects spoofed email, wrong status/source, extra fields, oversized notes and client timestamps', async () => {
    const db = userDb(USER, 'a@example.com');
    const ref = doc(db, `accountDeletionRequests/${USER}`);
    await assertFails(setDoc(ref, validRequest(USER, 'someone-else@example.com')));
    await assertFails(setDoc(ref, { ...validRequest(), status: 'approved' }));
    await assertFails(setDoc(ref, { ...validRequest(), status: 'completed' }));
    await assertFails(setDoc(ref, { ...validRequest(), source: 'admin' }));
    await assertFails(setDoc(ref, { ...validRequest(), deleteNow: true }));
    await assertFails(setDoc(ref, { ...validRequest(), notes: 'x'.repeat(1001) }));
    await assertFails(setDoc(ref, { ...validRequest(), notes: 42 }));
    await assertFails(setDoc(ref, { ...validRequest(), requestedAt: new Date('2020-01-01') }));
    const { notes, ...missing } = validRequest();
    await assertFails(setDoc(ref, missing));
  });

  it('lets the user read only their own request and never edit or delete it', async () => {
    await seed(USER);
    await seed(OTHER);
    const db = userDb(USER, 'a@example.com');
    await assertSucceeds(getDoc(doc(db, `accountDeletionRequests/${USER}`)));
    await assertFails(getDoc(doc(db, `accountDeletionRequests/${OTHER}`)));
    await assertFails(updateDoc(doc(db, `accountDeletionRequests/${USER}`), { status: 'completed' }));
    await assertFails(deleteDoc(doc(db, `accountDeletionRequests/${USER}`)));
  });

  it('lets an MFA admin read and process requests, but not a non-admin', async () => {
    await seed(USER);
    await assertSucceeds(getDoc(doc(adminDb(), `accountDeletionRequests/${USER}`)));
    await assertSucceeds(updateDoc(doc(adminDb(), `accountDeletionRequests/${USER}`), { status: 'completed' }));
    await assertFails(getDoc(doc(userDb(OTHER, 'b@example.com'), `accountDeletionRequests/${USER}`)));
  });

  it('does not let a request touch the real account data', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${USER}`), { role: 'tenant', status: 'ACTIVE' });
    });
    await assertSucceeds(setDoc(doc(userDb(USER, 'a@example.com'), `accountDeletionRequests/${USER}`), validRequest()));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snap = await getDoc(doc(context.firestore(), `users/${USER}`));
      if (!snap.exists() || snap.data().status !== 'ACTIVE') throw new Error('user profile was modified by a deletion request');
    });
  });
});
