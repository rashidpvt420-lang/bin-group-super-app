'use strict';
// P1-8 (audit 9 Nov 2026): painting payments can only be decided by finance_manager / finance_controller
// (paintingFinanceApprover.ts), but adminCreateUser rejected both roles, so nobody could be given the role.
// The roles must be provisionable, carry no admin-panel modules, and still need a live MFA session
// (the four-eyes "issuer cannot approve" rule is covered in painting-billing.test.cjs).
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminCreateUser } = lib('runtimeAll.js');
const { requirePaintingFinanceApprover } = lib('paintingFinanceApprover.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };

let founder;
let founderNoMfa;
test.before(async () => {
  founder = await createUser('founder_fin_prov', { role: 'super_admin', admin: true, super_admin: true }, MFA);
  founderNoMfa = await createUser('founder_fin_prov_nomfa', { role: 'super_admin', admin: true, super_admin: true });
});
test.beforeEach(clearFirestore);

for (const role of ['finance_manager', 'finance_controller']) {
  test(`${role} can be provisioned by an MFA Founder, starts suspended, gets no modules`, async () => {
    const email = `${role}.prov@example.invalid`;
    await expectHttpsError(call(adminCreateUser, founderNoMfa, { role, email, displayName: `QA ${role}` }), 'permission-denied');
    await expectHttpsError(call(adminCreateUser, founder, { role, email, displayName: `QA ${role}`, modules: ['financials'] }), 'permission-denied');
    const result = await call(adminCreateUser, founder, { role, email, displayName: `QA ${role}` });
    assert.equal(result.success, true);
    assert.equal(result.role, role);
    assert.deepEqual(result.modules, []);
    const record = await admin.auth().getUser(result.uid);
    assert.equal(record.customClaims.role, role);
    assert.equal(record.customClaims.suspended, true, 'portal authority waits for HR activation');
    assert.equal(record.customClaims.admin, false);
    assert.equal((await db.doc(`users/${result.uid}`).get()).get('role'), role);

    // Invited (suspended) account cannot decide painting payments even with MFA.
    const invitedToken = { ...record.customClaims, email, email_verified: true, firebase: { sign_in_second_factor: 'phone' } };
    await assert.rejects(requirePaintingFinanceApprover({ auth: { uid: result.uid, token: invitedToken } }), (error) => error.code === 'permission-denied');

    // After activation the approver gate passes only with a live MFA session.
    await admin.auth().updateUser(result.uid, { emailVerified: true });
    await admin.auth().setCustomUserClaims(result.uid, { ...record.customClaims, suspended: false });
    const active = { ...record.customClaims, suspended: false, email, email_verified: true };
    await assert.rejects(requirePaintingFinanceApprover({ auth: { uid: result.uid, token: active } }), (error) => error.code === 'permission-denied' && /MFA/.test(error.message));
    const ok = await requirePaintingFinanceApprover({ auth: { uid: result.uid, token: { ...active, firebase: { sign_in_second_factor: 'phone' } } } });
    assert.equal(ok.role, role);
    await admin.auth().deleteUser(result.uid);
  });
}
