// Employee ID cards + employment contract drafts (Rashid, 18 Nov 2026).
// Firestore and Storage: readable only by the employee, the HR manager tier and the Founder (CEO /
// Super Admin) with a second factor. No browser role can create, rewrite or delete them.
import { after, before, beforeEach, describe, it } from 'node:test';
import fs from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadString } from 'firebase/storage';

const projectId = process.env.GCLOUD_PROJECT || 'bin-group-57c60';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } };
const DOC_PATH = 'private_hr_profiles/staff_a/employee_documents/empctr_0123456789abcdef0123456789abcdef';
const SUMMARY_PATH = 'private_hr_profiles/staff_a/employee_credentials/current';
const CARD_INDEX_PATH = 'private_hr_profiles/_employee_card_index/cards/card_0123456789abcdef0123456789abcdef';
const FILE_PATH = 'privateHrDocuments/staff_a/employee-documents/empctr_0123456789abcdef0123456789abcdef.pdf';

const readers = [
  ['staff_a', { role: 'finance_manager' }, 'the employee themselves'],
  ['hr_admin_1', { role: 'hr_admin', ...MFA }, 'HR Admin with MFA'],
  ['hr_manager_1', { role: 'hr_manager', ...MFA }, 'HR Manager with MFA'],
  ['ceo_1', { role: 'ceo', ceo: true, ...MFA }, 'Founder / CEO with MFA'],
  ['super_1', { role: 'super_admin', super_admin: true, ...MFA }, 'Super Admin with MFA'],
];
const blocked = [
  ['staff_b', { role: 'finance_manager' }, 'another staff member'],
  ['hr_admin_nomfa', { role: 'hr_admin' }, 'HR Admin without MFA'],
  ['ceo_nomfa', { role: 'ceo', ceo: true }, 'CEO without MFA'],
  ['hr_staff_1', { role: 'hr_staff', ...MFA }, 'HR Staff'],
  ['admin_1', { role: 'admin', admin: true, ...MFA }, 'generic Admin with MFA'],
  ['fin_admin_1', { role: 'finance_admin', ...MFA }, 'Finance Admin'],
  ['ops_1', { role: 'operations_admin', ...MFA }, 'Operations Admin'],
  ['auditor_1', { role: 'auditor', ...MFA }, 'Auditor'],
  ['owner_1', { role: 'owner' }, 'Owner'],
];

let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
    storage: { rules: fs.readFileSync('storage.rules', 'utf8') },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, DOC_PATH), { staffUid: 'staff_a', documentType: 'EMPLOYMENT_CONTRACT_DRAFT', status: 'DRAFT_PENDING_LEGAL_REVIEW_AND_MOHRE_REGISTRATION' });
    await setDoc(doc(db, SUMMARY_PATH), { staffUid: 'staff_a', currentCardId: 'card_0123456789abcdef0123456789abcdef' });
    await setDoc(doc(db, CARD_INDEX_PATH), { staffUid: 'staff_a', status: 'ACTIVE' });
    await uploadString(ref(context.storage(), FILE_PATH), 'pdf', 'raw', { contentType: 'application/pdf' });
  });
});

const fsCtx = (uid, claims) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).firestore();
const stCtx = (uid, claims) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...claims }).storage();

describe('employee card / contract records (Firestore)', () => {
  for (const [uid, claims, label] of readers) {
    it(`${label} can read the record and summary`, async () => {
      const db = fsCtx(uid, claims);
      await assertSucceeds(getDoc(doc(db, DOC_PATH)));
      await assertSucceeds(getDoc(doc(db, SUMMARY_PATH)));
    });
  }
  for (const [uid, claims, label] of blocked) {
    it(`${label} cannot read the record or summary`, async () => {
      const db = fsCtx(uid, claims);
      await assertFails(getDoc(doc(db, DOC_PATH)));
      await assertFails(getDoc(doc(db, SUMMARY_PATH)));
    });
  }
  it('no browser role (HR, Founder, Admin, the employee) can create, update or delete records', async () => {
    for (const [uid, claims] of [...readers, ...blocked]) {
      const db = fsCtx(uid, claims);
      await assertFails(setDoc(doc(db, `private_hr_profiles/staff_a/employee_documents/empcard_new_${uid}`), { staffUid: 'staff_a', status: 'ACTIVE' }));
      await assertFails(updateDoc(doc(db, DOC_PATH), { status: 'SIGNED' }));
      await assertFails(deleteDoc(doc(db, DOC_PATH)));
      await assertFails(setDoc(doc(db, SUMMARY_PATH), { staffUid: 'staff_a' }));
    }
  });
  it('the QR card index is server-only for every role', async () => {
    for (const [uid, claims] of [...readers, ...blocked]) {
      const db = fsCtx(uid, claims);
      await assertFails(getDoc(doc(db, CARD_INDEX_PATH)));
      await assertFails(setDoc(doc(db, CARD_INDEX_PATH), { staffUid: uid, status: 'ACTIVE' }));
    }
  });
  it('the private HR profile itself stays closed to the employee', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'private_hr_profiles/staff_a'), { uid: 'staff_a', salaryPackage: { basicSalary: 1 } });
    });
    await assertFails(getDoc(doc(fsCtx('staff_a', { role: 'finance_manager' }), 'private_hr_profiles/staff_a')));
    await assertFails(getDoc(doc(fsCtx('hr_admin_1', { role: 'hr_admin', ...MFA }), 'private_hr_profiles/staff_a')));
  });
});

describe('employee card / contract PDFs (Storage)', () => {
  for (const [uid, claims, label] of readers) {
    it(`${label} can read the PDF`, async () => {
      await assertSucceeds(getBytes(ref(stCtx(uid, claims), FILE_PATH)));
    });
  }
  for (const [uid, claims, label] of blocked) {
    it(`${label} cannot read the PDF`, async () => {
      await assertFails(getBytes(ref(stCtx(uid, claims), FILE_PATH)));
    });
  }
  it('no browser role can upload, overwrite or delete the PDFs', async () => {
    for (const [uid, claims] of [...readers, ...blocked]) {
      const storage = stCtx(uid, claims);
      await assertFails(uploadString(ref(storage, FILE_PATH), 'tampered', 'raw', { contentType: 'application/pdf' }));
      await assertFails(uploadString(ref(storage, `privateHrDocuments/staff_a/employee-documents/new-${uid}.pdf`), 'x', 'raw', { contentType: 'application/pdf' }));
      await assertFails(deleteObject(ref(storage, FILE_PATH)));
    }
  });
  it('other private HR documents stay closed to everyone, including the employee', async () => {
    const other = 'privateHrDocuments/staff_a/passport.pdf';
    await env.withSecurityRulesDisabled(async (context) => {
      await uploadString(ref(context.storage(), other), 'p', 'raw', { contentType: 'application/pdf' });
    });
    for (const [uid, claims] of readers) await assertFails(getBytes(ref(stCtx(uid, claims), other)));
  });
});
