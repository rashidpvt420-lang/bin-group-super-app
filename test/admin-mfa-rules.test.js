// N-05 regression: Firestore rules granted Admin-tier access on claims alone. A non-enrolled,
// bridged (custom-token) or non-MFA Admin session had full browser read/write through isAdmin()
// and the Admin catch-alls. hasAdminClaim() now requires firebase.sign_in_second_factor.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const ADMIN = { role: 'admin', admin: true, email: 'admin-n05@example.com', email_verified: true };

describe('N-05 Admin rules access requires a second factor', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'contracts/n05_contract'), { ownerId: 'owner_n05', status: 'ACTIVE' });
      await setDoc(doc(db, 'company_settings_n05/doc'), { value: 1 });
      await setDoc(doc(db, 'users/admin_n05'), { role: 'admin' });
    });
  });
  after(async () => testEnv.cleanup());

  const noMfaDb = () => testEnv.authenticatedContext('admin_n05', { ...ADMIN }).firestore();
  const customTokenDb = () => testEnv.authenticatedContext('admin_n05', { ...ADMIN, firebase: { sign_in_provider: 'custom' } }).firestore();
  const mfaDb = () => testEnv.authenticatedContext('admin_n05', { ...ADMIN, ...MFA }).firestore();

  it('Admin without MFA cannot read or write contracts', async () => {
    await assertFails(getDoc(doc(noMfaDb(), 'contracts/n05_contract')));
    await assertFails(updateDoc(doc(noMfaDb(), 'contracts/n05_contract'), { status: 'TERMINATED', updatedAt: serverTimestamp() }));
  });

  it('bridged custom-token Admin session (no second factor) gets no Admin catch-all access', async () => {
    await assertFails(getDoc(doc(customTokenDb(), 'company_settings_n05/doc')));
    await assertFails(setDoc(doc(customTokenDb(), 'company_settings_n05/new'), { value: 2 }));
  });

  it('control: MFA Admin keeps contract management and catch-all access', async () => {
    await assertSucceeds(getDoc(doc(mfaDb(), 'contracts/n05_contract')));
    await assertSucceeds(updateDoc(doc(mfaDb(), 'contracts/n05_contract'), { status: 'TERMINATED', updatedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(doc(mfaDb(), 'company_settings_n05/doc')));
  });

  it('control: super_admin/ceo claims also need the second factor', async () => {
    for (const claims of [{ role: 'super_admin' }, { ceo: true }, { superAdmin: true }]) {
      const db = testEnv.authenticatedContext('admin_n05', { ...claims, email_verified: true }).firestore();
      await assertFails(getDoc(doc(db, 'company_settings_n05/doc')));
      const mfa = testEnv.authenticatedContext('admin_n05', { ...claims, email_verified: true, ...MFA }).firestore();
      await assertSucceeds(getDoc(doc(mfa, 'company_settings_n05/doc')));
    }
  });
});
