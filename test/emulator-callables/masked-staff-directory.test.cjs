'use strict';
// P1-10 (audit 9 Nov 2026): masked staff directory for roles that may not list the raw users collection.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getMaskedStaffDirectory, maskPhone } = lib('maskedStaffDirectory.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };

let financeMfa;
let financeNoMfa;
let technician;
let tenant;
test.before(async () => {
  financeMfa = await createUser('fin_masked_mfa', { role: 'finance_staff' }, MFA);
  financeNoMfa = await createUser('fin_masked_nomfa', { role: 'finance_staff' });
  technician = await createUser('tech_masked', { role: 'technician' }, MFA);
  tenant = await createUser('tenant_masked', { role: 'tenant' }, MFA);
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/tech_a').set({ role: 'technician', displayName: 'Tech A', email: 'a@example.invalid', phoneNumber: '+971 50 123 4567', emiratesId: '784-0000', baseSalary: 4000, status: 'ACTIVE' });
  await db.doc('users/hr_a').set({ role: 'hr_staff', fullName: 'HR A', email: 'hr@example.invalid', phone: '0501112222' });
  await db.doc('users/tenant_a').set({ role: 'tenant', displayName: 'Tenant A', email: 't@example.invalid', phoneNumber: '+971509998888' });
  await db.doc('users/owner_a').set({ role: 'owner', displayName: 'Owner A' });
});

test('maskPhone keeps only the last three digits', () => {
  assert.equal(maskPhone('+971 50 123 4567'), '•••• 567');
  assert.equal(maskPhone('123'), null);
  assert.equal(maskPhone(undefined), null);
});

test('an MFA finance session gets staff names, roles and masked phones only', async () => {
  const result = await call(getMaskedStaffDirectory, financeMfa, {});
  const byUid = Object.fromEntries(result.entries.map((entry) => [entry.uid, entry]));
  assert.deepEqual(Object.keys(byUid).sort(), ['hr_a', 'tech_a']);
  assert.deepEqual(byUid.tech_a, { uid: 'tech_a', displayName: 'Tech A', role: 'technician', department: null, status: 'ACTIVE', maskedPhone: '•••• 567' });
  assert.equal(byUid.hr_a.displayName, 'HR A');
  const serialized = JSON.stringify(result);
  for (const secret of ['a@example.invalid', '4567', '784-0000', '4000', 'baseSalary', 'Tenant A', 'Owner A']) {
    assert.equal(serialized.includes(secret), false, `${secret} must not leave the server`);
  }
});

test('paging returns a cursor and the next page', async () => {
  const first = await call(getMaskedStaffDirectory, financeMfa, { limit: 1 });
  assert.equal(first.entries.length, 1);
  assert.ok(first.nextStartAfterUid);
  const second = await call(getMaskedStaffDirectory, financeMfa, { limit: 1, startAfterUid: first.nextStartAfterUid });
  assert.equal(second.entries.length, 1);
  assert.notEqual(second.entries[0].uid, first.entries[0].uid);
  assert.equal(second.nextStartAfterUid, null);
});

test('no MFA, technicians, tenants and signed-out callers are refused', async () => {
  await expectHttpsError(call(getMaskedStaffDirectory, financeNoMfa, {}), 'permission-denied');
  await expectHttpsError(call(getMaskedStaffDirectory, technician, {}), 'permission-denied');
  await expectHttpsError(call(getMaskedStaffDirectory, tenant, {}), 'permission-denied');
  await expectHttpsError(call(getMaskedStaffDirectory, null, {}), 'unauthenticated');
});
