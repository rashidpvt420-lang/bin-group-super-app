// AI usage/health records that back advisory answers stay server-only: no client can forge them.
import { after, before, describe, it } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import fs from 'node:fs';

let testEnv;
describe('AI answer support records', () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({ projectId: 'bin-group-57c60', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  });
  after(async () => testEnv.cleanup());
  const as = (uid, extra = {}) => testEnv.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true, ...extra }).firestore();

  it('owner and tenant cannot write their own AI usage counters', async () => {
    await assertFails(setDoc(doc(as('aic_o', { role: 'owner' }), 'ai_usage/aic_o_2026-10-31'), { uid: 'aic_o', used: 0 }));
    await assertFails(setDoc(doc(as('aic_t', { role: 'tenant' }), 'ai_usage/aic_t_2026-10-31'), { uid: 'aic_t', used: 0 }));
  });
  it('no client can write AI health metrics', async () => {
    await assertFails(setDoc(doc(as('aic_o', { role: 'owner' }), 'ai_health_daily/2026-10-31'), { liveSuccess: 999 }));
    await assertFails(setDoc(doc(testEnv.unauthenticatedContext().firestore(), 'ai_health_daily/2026-10-31'), { liveSuccess: 999 }));
  });
});
