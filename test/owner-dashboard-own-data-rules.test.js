// Owner dashboard queries must only read the caller's own data. Firestore rules are
// not filters, so each query the dashboard issues carries an owner-scoped filter.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const A = 'owner_dash_a';
const B = 'owner_dash_b';
const A_EMAIL = 'owner-a@example.com';

describe('owner dashboard own-data reads', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      const f = c.firestore();
      await setDoc(doc(f, `users/${A}`), { role: 'owner', status: 'active' });
      await setDoc(doc(f, 'properties/pa'), { ownerId: A, name: 'A' });
      await setDoc(doc(f, 'properties/pb'), { ownerId: B, name: 'B' });
      await setDoc(doc(f, 'propertyPassports/ppa'), { ownerId: A, ownerEmail: A_EMAIL });
      await setDoc(doc(f, 'propertyPassports/ppb'), { ownerId: B });
      await setDoc(doc(f, 'invoices/ia'), { ownerUid: A, contractId: 'c1' });
      await setDoc(doc(f, 'invoices/ib'), { ownerUid: B, contractId: 'c1' });
      await setDoc(doc(f, 'payment_transactions/ta'), { ownerId: A, contractId: 'c1' });
      await setDoc(doc(f, 'payment_transactions/tb'), { ownerId: B, contractId: 'c1' });
    });
  });
  after(async () => testEnv.cleanup());

  const aDb = () => testEnv.authenticatedContext(A, { role: 'owner', email: A_EMAIL, email_verified: true }).firestore();
  const q = (db, c, ...w) => getDocs(query(collection(db, c), ...w.map(([f, v]) => where(f, '==', v))));

  it('owner reads their own docs with the queries the dashboard uses', async () => {
    const db = aDb();
    await assertSucceeds(q(db, 'properties', ['ownerId', A]));
    await assertSucceeds(q(db, 'properties', ['ownerUid', A]));
    await assertSucceeds(q(db, 'propertyPassports', ['ownerId', A]));
    await assertSucceeds(q(db, 'propertyPassports', ['ownerEmail', A_EMAIL]));
    await assertSucceeds(q(db, 'invoices', ['ownerUid', A]));
    await assertSucceeds(q(db, 'invoices', ['contractId', 'c1'], ['ownerUid', A]));
    await assertSucceeds(q(db, 'payment_transactions', ['ownerId', A]));
    await assertSucceeds(q(db, 'payment_transactions', ['contractId', 'c1'], ['ownerId', A]));
    await assertSucceeds(getDoc(doc(db, 'properties/pa')));
  });

  it("owner is denied other owners' docs and unscoped queries", async () => {
    const db = aDb();
    await assertFails(getDoc(doc(db, 'properties/pb')));
    await assertFails(getDoc(doc(db, 'propertyPassports/ppb')));
    await assertFails(getDoc(doc(db, 'invoices/ib')));
    await assertFails(getDoc(doc(db, 'payment_transactions/tb')));
    await assertFails(q(db, 'properties', ['ownerId', B]));
    await assertFails(q(db, 'invoices', ['contractId', 'c1']));
    await assertFails(q(db, 'payment_transactions', ['contractId', 'c1']));
  });
});
