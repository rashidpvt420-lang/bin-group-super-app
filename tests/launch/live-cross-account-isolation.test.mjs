import assert from 'node:assert/strict';
import test from 'node:test';
import { accountsFromEnv, buildPlan, classify } from '../../scripts/live-cross-account-isolation.mjs';

test('classification never lets a broken channel or a 404 pass as denied', () => {
  assert.equal(classify({ ownStatus: 200, foreignStatus: 403 }), 'PASS');
  assert.equal(classify({ ownStatus: 200, foreignStatus: 200 }), 'LEAK');
  assert.equal(classify({ ownStatus: 403, foreignStatus: 403 }), 'CHANNEL_FAIL');
  assert.equal(classify({ ownStatus: 200, foreignStatus: 404 }), 'INCONCLUSIVE');
});
test('refuses the real technician account and a reused Technician B', () => {
  assert.throws(() => accountsFromEnv({ E2E_TECHNICIAN_B_EMAIL: 'technician@bin-groups.com', E2E_TECHNICIAN_B_PASSWORD: 'x' }), /forbidden/);
  assert.throws(() => accountsFromEnv({ E2E_TECHNICIAN_EMAIL: 'a@x', E2E_TECHNICIAN_PASSWORD: 'x', E2E_TECHNICIAN_B_EMAIL: 'a@x', E2E_TECHNICIAN_B_PASSWORD: 'y' }), /distinct/);
  assert.equal(accountsFromEnv({}).technicianB, null);
});
test('plan covers owner A/B, tenant/other unit, broker and technician A/B', () => {
  const ids = buildPlan({ ownerProperty: 'e2e-live-role-property' }).map((p) => p.id);
  for (const want of ['owner-A-vs-owner-B-property', 'tenant-vs-other-tenant-unit', 'broker-vs-owner-property', 'technician-A-vs-technician-B-job']) assert.ok(ids.includes(want));
});
