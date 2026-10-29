// Official stamped documents: the SHA-256 registry and statement quota are server-only.
// Clients (including the document's own subject and admins) can never create or edit entries,
// so a forged statement cannot be "registered" as genuine.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const ADMIN = { role: 'admin', admin: true, email: 'admin-reg@example.com', email_verified: true };
const USER = 'reg_user_a';
const DOC_ID = `stmt_${'a'.repeat(32)}`;
const entry = { documentId: DOC_ID, documentType: 'money_statement', subjectUid: USER, sha256: 'b'.repeat(64), status: 'issued' };

describe('issued_document_registry / money_statement_rate_limits rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => { await testEnv.clearFirestore(); });
  after(async () => testEnv.cleanup());

  const userDb = () => testEnv.authenticatedContext(USER, { email: 'a@example.com', email_verified: true }).firestore();
  const adminDb = () => testEnv.authenticatedContext('admin_reg', { ...ADMIN, ...MFA }).firestore();
  const seed = () => testEnv.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), `issued_document_registry/${DOC_ID}`), entry);
    await setDoc(doc(c.firestore(), `money_statement_rate_limits/${USER}`), { day: '2026-10-29', count: 3 });
  });

  it('denies every client write to the registry, even for the subject and MFA admins', async () => {
    await assertFails(setDoc(doc(userDb(), `issued_document_registry/${DOC_ID}`), entry));
    await assertFails(setDoc(doc(adminDb(), `issued_document_registry/${DOC_ID}`), entry));
    await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), `issued_document_registry/${DOC_ID}`), entry));
    await seed();
    await assertFails(updateDoc(doc(userDb(), `issued_document_registry/${DOC_ID}`), { sha256: 'c'.repeat(64) }));
    await assertFails(updateDoc(doc(adminDb(), `issued_document_registry/${DOC_ID}`), { sha256: 'c'.repeat(64) }));
    await assertFails(deleteDoc(doc(adminDb(), `issued_document_registry/${DOC_ID}`)));
  });

  it('keeps registry entries unreadable to the public and to the subject (verification goes through the callable)', async () => {
    await seed();
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), `issued_document_registry/${DOC_ID}`)));
    await assertFails(getDoc(doc(userDb(), `issued_document_registry/${DOC_ID}`)));
    await assertSucceeds(getDoc(doc(adminDb(), `issued_document_registry/${DOC_ID}`)));
  });

  it('lets no client reset or read the statement quota', async () => {
    await seed();
    await assertFails(getDoc(doc(userDb(), `money_statement_rate_limits/${USER}`)));
    await assertFails(setDoc(doc(userDb(), `money_statement_rate_limits/${USER}`), { day: '2026-10-29', count: 0 }));
    await assertFails(setDoc(doc(adminDb(), `money_statement_rate_limits/${USER}`), { day: '2026-10-29', count: 0 }));
    await assertFails(deleteDoc(doc(userDb(), `money_statement_rate_limits/${USER}`)));
  });
});
