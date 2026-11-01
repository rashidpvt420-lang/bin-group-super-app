// Per-job tenant links and reports are server-only: no client reads token hashes or forges reports.
import { after, before, beforeEach, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
describe('tenant job link rules', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  beforeEach(async () => {
    await testEnv.clearFirestore();
    await testEnv.withSecurityRulesDisabled(async (c) => {
      await setDoc(doc(c.firestore(), 'tenant_job_links/h1'), { ticketId: 'T1', tenantId: 'tjl_t', revoked: false });
      await setDoc(doc(c.firestore(), 'tenant_job_reports/r1'), { ticketId: 'T1', tenantId: 'tjl_t', note: 'leak' });
    });
  });
  after(async () => testEnv.cleanup());
  const as = (uid, extra = {}) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();
  const adminDb = () => as('tjl_admin', { role: 'admin', admin: true, ...MFA });

  it('tenants and owners cannot read link hashes; no client writes them', async () => {
    for (const db of [as('tjl_t', { role: 'tenant' }), as('tjl_o', { role: 'owner' })]) {
      await assertFails(getDoc(doc(db, 'tenant_job_links/h1')));
    }
    for (const db of [adminDb(), as('tjl_t', { role: 'tenant' }), as('tjl_o', { role: 'owner' })]) {
      await assertFails(setDoc(doc(db, 'tenant_job_links/h2'), { ticketId: 'T1', tenantId: 'tjl_t', revoked: false }));
      await assertFails(updateDoc(doc(db, 'tenant_job_links/h1'), { revoked: false, uses: 0 }));
    }
  });
  it('admins read reports; tenants cannot read or forge them', async () => {
    await assertSucceeds(getDoc(doc(adminDb(), 'tenant_job_reports/r1')));
    await assertFails(getDoc(doc(as('tjl_t', { role: 'tenant' }), 'tenant_job_reports/r1')));
    await assertFails(setDoc(doc(as('tjl_t', { role: 'tenant' }), 'tenant_job_reports/r2'), { ticketId: 'T1', tenantId: 'tjl_t', note: 'x' }));
  });
});
