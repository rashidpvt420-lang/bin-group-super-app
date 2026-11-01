'use strict';
// Owners' committee records: records-only, legal-review flag, storage docs only, own-data only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
let owner, other, tenant;
const doc = 'https://firebasestorage.googleapis.com/v0/b/x/o/budget.pdf';
test.before(async () => {
  owner = await createUser('ocr_owner', { role: 'owner' });
  other = await createUser('ocr_owner2', { role: 'owner' });
  tenant = await createUser('ocr_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('add and list own records with the records-only legal notice', async () => {
  await expectHttpsError(call(rt.ownerAddCommitteeRecord, tenant, { kind: 'BUDGET', title: 'x', buildingName: 'y', documentUrl: doc }), 'permission-denied');
  await expectHttpsError(call(rt.ownerAddCommitteeRecord, owner, { kind: 'POOL_FUNDS', title: '2027 budget', buildingName: 'Tower A', documentUrl: doc }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerAddCommitteeRecord, owner, { kind: 'BUDGET', title: '2027 budget', buildingName: 'Tower A', documentUrl: 'https://x.example/a.pdf' }), 'invalid-argument');
  await call(rt.ownerAddCommitteeRecord, owner, { kind: 'BUDGET', title: '2027 budget', buildingName: 'Tower A', period: '2027', amountAedAsStated: 120000, documentUrl: doc });
  const res = await call(rt.getOwnerCommitteeRecords, owner, {});
  assert.equal(res.records.length, 1);
  assert.equal(res.records[0].amountAedAsStated, 120000);
  assert.match(res.notice.en, /does not hold, collect or pool/);
  assert.match(res.notice.en, /legal review/);
  assert.equal((await call(rt.getOwnerCommitteeRecords, other, {})).records.length, 0);
});
