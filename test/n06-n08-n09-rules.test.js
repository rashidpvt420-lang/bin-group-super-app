// N-06 / N-08 / N-09 regressions (Firestore rules).
// N-06: ops/HR staff could overwrite technician readiness fields (device, GPS, approval, medical)
//       that feed the server dispatch readiness gate.
// N-08: account_manager (counted in isFinance) could read all payslips and edit salaryHistory.
// N-09: an Owner could swap the IBAN on a VERIFIED bank account while verified/verifiedBy stayed true.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const ctx = (uid, claims) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const seed = (path, data) => testEnv.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), path), data));

describe('N-06 / N-08 / N-09 Firestore rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bin-group-57c60',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await seed('technicians/tech_a', { uid: 'tech_a', displayName: 'Tech A', approvalStatus: 'pending', deviceVerified: false, skills: ['ac'] });
    await seed('staffPayslips/slip_other', { staffId: 'staff_other', uid: 'staff_other', netPay: 9000 });
    await seed('salaryHistory/hist_other', { staffId: 'staff_other', basic: 8000 });
    await seed('ownerBankAccounts/acct_verified', {
      ownerId: 'owner_n09', iban: 'AE070331234567890123456', last4: '3456', bankName: 'Bank A',
      verified: true, verifiedBy: 'finance_admin_1', status: 'VERIFIED', verificationStatus: 'VERIFIED',
    });
    await seed('ownerBankAccounts/acct_pending', {
      ownerId: 'owner_n09', iban: 'AE070331234567890123999', last4: '3999', bankName: 'Bank A',
      verified: false, status: 'PENDING_VERIFICATION', verificationStatus: 'PENDING_VERIFICATION',
    });
  });
  after(async () => testEnv.cleanup());

  // ---- N-06 ----
  const staffActors = () => [
    ['ops', ctx('ops_n06', { role: 'operations_admin' })],
    ['hr', ctx('hr_n06', { role: 'hr_staff' })],
    ['canManageTechnicians', ctx('perm_n06', { role: 'operations_manager', permissions: { canManageTechnicians: true } })],
  ];
  // Residual (N-11): the Admin catch-all `match /{collection}/{document=**}` still ORs Admin browser
  // writes over technicians/{id}; its exclusion list is pinned by scripts/harden-final-firestore-authority.mjs.
  const readinessPatches = [
    { deviceVerified: true },
    { registeredDeviceId: 'forged-device' },
    { lastGpsAt: serverTimestamp() },
    { approvalStatus: 'approved' },
    { medicalCardStatus: 'valid' },
    { onDuty: true, dutyStatus: 'ON_DUTY' },
  ];
  it('N-06: staff browser clients cannot write technician readiness fields', async () => {
    for (const [, db] of staffActors()) {
      for (const patch of readinessPatches) {
        await assertFails(updateDoc(doc(db, 'technicians/tech_a'), patch));
      }
    }
  });
  it('N-06: staff cannot create a technician profile pre-marked ready', async () => {
    for (const [, db] of staffActors()) {
      await assertFails(setDoc(doc(db, 'technicians/tech_new'), { uid: 'tech_new', approvalStatus: 'approved', deviceVerified: true }));
    }
  });
  it('N-06 control: staff keep non-security profile edits and plain creates', async () => {
    for (const [name, db] of staffActors()) {
      await assertSucceeds(updateDoc(doc(db, 'technicians/tech_a'), { skills: ['ac', name], updatedAt: serverTimestamp() }));
      await assertSucceeds(setDoc(doc(db, `technicians/tech_new_${name}`), { uid: `tech_new_${name}`, displayName: 'New Tech' }));
    }
  });

  // ---- N-08 ----
  it('N-08: account_manager cannot read or write other staff payroll records', async () => {
    const am = ctx('am_n08', { role: 'account_manager' });
    await assertFails(getDoc(doc(am, 'staffPayslips/slip_other')));
    await assertFails(setDoc(doc(am, 'staffPayslips/slip_new'), { staffId: 'staff_other', netPay: 1 }));
    await assertFails(getDoc(doc(am, 'salaryHistory/hist_other')));
    await assertFails(updateDoc(doc(am, 'salaryHistory/hist_other'), { basic: 1 }));
  });
  it('N-08 control: HR and finance_admin keep payroll access', async () => {
    for (const db of [ctx('hr_n08', { role: 'hr_manager' }), ctx('fin_n08', { role: 'finance_admin' })]) {
      await assertSucceeds(getDoc(doc(db, 'staffPayslips/slip_other')));
      await assertSucceeds(getDoc(doc(db, 'salaryHistory/hist_other')));
    }
  });

  // ---- N-09 ----
  it('N-09: Owner cannot swap the IBAN (or bank identity) on a verified account', async () => {
    const owner = ctx('owner_n09', { role: 'owner' });
    await assertFails(updateDoc(doc(owner, 'ownerBankAccounts/acct_verified'), { iban: 'AE990000000000000000001', last4: '0001', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(owner, 'ownerBankAccounts/acct_verified'), { accountHolderName: 'Someone Else' }));
    await assertFails(updateDoc(doc(owner, 'ownerBankAccounts/acct_verified'), { bankName: 'Bank B' }));
    // Exact audit probe G13: IBAN swap plus status PENDING was ALLOWED with verified/verifiedBy retained.
    await assertFails(updateDoc(doc(owner, 'ownerBankAccounts/acct_verified'), { iban: 'AE990000000000000000999', status: 'PENDING' }));
    await assertFails(updateDoc(doc(owner, 'ownerBankAccounts/acct_verified'), { iban: 'AE990000000000000000999', status: 'PENDING_VERIFICATION', verificationStatus: 'PENDING', updatedAt: serverTimestamp() }));
  });
  it('N-09 control: Owner can still correct a pending account and add a new account', async () => {
    const owner = ctx('owner_n09', { role: 'owner' });
    await assertSucceeds(updateDoc(doc(owner, 'ownerBankAccounts/acct_pending'), { iban: 'AE070331234567890120000', last4: '0000', updatedAt: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(owner, 'ownerBankAccounts/acct_new'), {
      ownerId: 'owner_n09', iban: 'AE990000000000000000001', last4: '0001', bankName: 'Bank B', status: 'PENDING_VERIFICATION',
    }));
  });
});
