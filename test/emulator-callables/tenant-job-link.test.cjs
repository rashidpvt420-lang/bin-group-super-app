'use strict';
// Per-job tenant link: hash-only storage, expiry/revocation, only the job's signed-in tenant, audited reports, no status change.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { Timestamp } = require('firebase-admin/firestore');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { createTenantJobLink, resolveTenantJobLink, reportViaTenantJobLink } = lib('runtimeAll.js');
let adminU, owner, otherOwner, tenant, otherTenant;
const tokenOf = (linkPath) => new URL(`https://x${linkPath}`).searchParams.get('t');
test.before(async () => {
  adminU = await createUser('tjl_admin', { role: 'admin' });
  owner = await createUser('tjl_owner', { role: 'owner' });
  otherOwner = await createUser('tjl_owner2', { role: 'owner' });
  tenant = await createUser('tjl_tenant', { role: 'tenant' });
  otherTenant = await createUser('tjl_tenant2', { role: 'tenant' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('maintenanceTickets/T_100').set({ ownerId: 'tjl_owner', tenantId: 'tjl_tenant', status: 'COMPLETED_PENDING_APPROVAL', title: 'AC leak' });
});

test('owner issues link: only hash stored, bilingual notice, audit; new link revokes old', async () => {
  const first = await call(createTenantJobLink, owner, { ticketId: 'T_100' });
  const raw = tokenOf(first.linkPath);
  assert.match(raw, /^[a-f0-9]{64}$/);
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const stored = (await db.doc(`tenant_job_links/${hash}`).get()).data();
  assert.equal(stored.tenantId, 'tjl_tenant');
  assert.ok(!JSON.stringify(stored).includes(raw));
  const n = (await db.collection('notifications').where('type', '==', 'TENANT_JOB_LINK').get()).docs[0].data();
  assert.ok(n.titleAr && n.bodyAr);
  const second = await call(createTenantJobLink, adminU, { ticketId: 'T_100' });
  assert.equal(second.revokedPrevious, 1);
  await expectHttpsError(call(resolveTenantJobLink, tenant, { token: raw }), 'failed-precondition');
  assert.equal((await db.collection('audit_logs').where('action', '==', 'TENANT_JOB_LINK_ISSUED').get()).size, 2);
  await expectHttpsError(call(createTenantJobLink, otherOwner, { ticketId: 'T_100' }), 'permission-denied');
  await expectHttpsError(call(createTenantJobLink, tenant, { ticketId: 'T_100' }), 'permission-denied');
});

test('only the job tenant can use the link; expired links refused', async () => {
  const raw = tokenOf((await call(createTenantJobLink, owner, { ticketId: 'T_100' })).linkPath);
  const view = await call(resolveTenantJobLink, tenant, { token: raw });
  assert.equal(view.ticketId, 'T_100');
  assert.equal(view.canConfirm, true);
  await expectHttpsError(call(resolveTenantJobLink, otherTenant, { token: raw }), 'permission-denied');
  await expectHttpsError(call(resolveTenantJobLink, owner, { token: raw }), 'permission-denied');
  await expectHttpsError(call(resolveTenantJobLink, null, { token: raw }), 'unauthenticated');
  await expectHttpsError(call(resolveTenantJobLink, tenant, { token: 'f'.repeat(64) }), 'failed-precondition');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  await db.doc(`tenant_job_links/${hash}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
  await expectHttpsError(call(resolveTenantJobLink, tenant, { token: raw }), 'failed-precondition');
});

test('report is audited, capped and never changes the ticket status', async () => {
  const raw = tokenOf((await call(createTenantJobLink, owner, { ticketId: 'T_100' })).linkPath);
  await expectHttpsError(call(reportViaTenantJobLink, tenant, { token: raw, note: 'bad' }), 'invalid-argument');
  for (let i = 0; i < 5; i += 1) await call(reportViaTenantJobLink, tenant, { token: raw, note: `Still dripping water ${i}` });
  await expectHttpsError(call(reportViaTenantJobLink, tenant, { token: raw, note: 'Still dripping water again' }), 'resource-exhausted');
  assert.equal((await db.collection('tenant_job_reports').get()).size, 5);
  assert.equal((await db.collection('audit_logs').where('action', '==', 'TENANT_JOB_LINK_REPORT').get()).size, 5);
  assert.equal((await db.doc('maintenanceTickets/T_100').get()).data().status, 'COMPLETED_PENDING_APPROVAL');
});
