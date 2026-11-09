'use strict';
// Audit D-04 (Nov 2026): finance_manager, finance_controller and payroll_admin are assignable through
// the existing staff provisioning callable, but only by a Super Admin / CEO with MFA and live claims.
// Every assignment is audit-logged with financeTierAssignment: true.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminCreateUser } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const create = (actor, role, n) => call(adminCreateUser, actor, { role, email: `fin.tier.${role}.${n}@example.invalid`, displayName: `Finance Tier ${role}` });

test.beforeEach(clearFirestore);

test('plain admin cannot assign a finance tier; ordinary staff roles still work', async () => {
  const adminActor = await createUser('d04_admin', { role: 'admin', admin: true }, { tokenExtra: MFA });
  for (const role of ['finance_manager', 'finance_controller', 'payroll_admin']) {
    await expectHttpsError(create(adminActor, role, 'a'), 'permission-denied');
    await assert.rejects(admin.auth().getUserByEmail(`fin.tier.${role}.a@example.invalid`), /no user record|user-not-found/i);
  }
});

test('super_admin without MFA is refused', async () => {
  const sa = await createUser('d04_sa_nomfa', { role: 'super_admin', super_admin: true });
  await expectHttpsError(create(sa, 'finance_manager', 'b'), 'permission-denied');
});

test('super_admin demoted in live claims is refused', async () => {
  const sa = await createUser('d04_sa_stale', { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
  await admin.auth().setCustomUserClaims(sa.uid, { role: 'admin', admin: true });
  await expectHttpsError(create(sa, 'finance_controller', 'c'), 'permission-denied');
});

for (const role of ['finance_manager', 'finance_controller', 'payroll_admin']) {
  test(`super_admin with MFA assigns ${role}, server-derived claims, audit logged`, async () => {
    const sa = await createUser(`d04_sa_${role}`, { role: 'super_admin', super_admin: true }, { tokenExtra: MFA });
    const result = await create(sa, role, 'ok');
    assert.equal(result.success, true);
    assert.equal(result.role, role);
    const record = await admin.auth().getUser(result.uid);
    assert.equal(record.customClaims.role, role);
    assert.equal(record.customClaims.admin, false);
    assert.equal(record.customClaims.suspended, true, 'portal stays restricted until HR activation');
    const audit = await db.collection('audit_logs').where('targetId', '==', result.uid).get();
    const entry = audit.docs.map((d) => d.data()).find((d) => d.action === 'ADMIN_CREATE_STAFF_USER');
    assert.ok(entry, 'audit entry written');
    assert.equal(entry.metadata.financeTierAssignment, true);
    assert.equal(entry.actorId, sa.uid);
  });
}
