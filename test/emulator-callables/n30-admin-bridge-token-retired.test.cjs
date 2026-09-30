'use strict';
// N-30 regression: mintAdminBridgeToken minted an MFA-less Firebase custom token for any caller
// with an admin/staff claim. It is retired: every caller is refused and no token is minted.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, lib, createUser, call, expectHttpsError } = require('./_setup.cjs');

const { mintAdminBridgeToken } = lib('adminBridgeAuth.js');

let minted = 0;
let restore;
test.before(() => {
  const auth = admin.auth();
  const original = auth.createCustomToken.bind(auth);
  auth.createCustomToken = async (...args) => { minted += 1; return original(...args); };
  restore = () => { auth.createCustomToken = original; };
});
test.after(() => restore && restore());

for (const [uid, claims] of [
  ['admin_n30', { role: 'admin', admin: true }],
  ['super_n30', { role: 'super_admin', superAdmin: true }],
  ['dispatcher_n30', { role: 'dispatcher' }],
]) {
  test(`${claims.role} cannot mint an admin bridge custom token`, async () => {
    const actor = await createUser(uid, claims);
    await expectHttpsError(call(mintAdminBridgeToken, actor, {}), 'failed-precondition');
    assert.equal(minted, 0, 'no custom token may be minted');
  });
}

test('unauthenticated callers are still rejected as unauthenticated', async () => {
  await expectHttpsError(call(mintAdminBridgeToken, null, {}), 'unauthenticated');
  assert.equal(minted, 0);
});
