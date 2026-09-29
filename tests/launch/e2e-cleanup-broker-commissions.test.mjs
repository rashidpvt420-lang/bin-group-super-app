// E2E cleanup regression: deleting the synthetic owner's contracts must also remove (or,
// when already PAID, void) the broker commission records created for those contracts.
// Uses an in-memory Firestore double; nothing here touches a real project.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {
  cleanupBrokerCommissionsForContracts,
  collectOwnerContractIds,
  E2E_COMMISSION_VOID_REASON,
} from '../../scripts/lib/e2e-contract-commission-cleanup.mjs';

function fakeDb(seed) {
  const store = new Map(Object.entries(seed).map(([path, data]) => [path, { ...data }]));
  const snap = (path) => ({
    id: path.split('/').pop(),
    exists: store.has(path),
    data: () => (store.has(path) ? { ...store.get(path) } : undefined),
    ref: docRef(path),
  });
  function docRef(path) {
    return {
      path,
      get: async () => snap(path),
      update: async (patch) => { if (!store.has(path)) throw new Error('NOT_FOUND'); store.set(path, { ...store.get(path), ...patch }); },
      delete: async () => { store.delete(path); },
    };
  }
  function query(name, filters, max = Infinity) {
    return {
      where: (field, op, value) => { assert.equal(op, '=='); return query(name, [...filters, [field, value]], max); },
      limit: (n) => query(name, filters, n),
      get: async () => {
        const docs = [...store.keys()]
          .filter((p) => p.startsWith(`${name}/`) && p.split('/').length === 2)
          .filter((p) => filters.every(([f, v]) => store.get(p)[f] === v))
          .slice(0, max)
          .map(snap);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }
  return {
    store,
    collection: (name) => ({ ...query(name, []), doc: (id) => docRef(`${name}/${id}`) }),
  };
}

test('commissions tied to the E2E owner contracts are removed; PAID ones voided; others untouched', async () => {
  const db = fakeDb({
    'contracts/e2e_c1': { ownerUid: 'e2e-owner' },
    'contracts/e2e_c2': { ownerId: 'e2e-owner' },
    'contracts/real_c': { ownerUid: 'real-owner' },
    'broker_commissions/commission_e2e_c1': { contractId: 'e2e_c1', status: 'PENDING', amount: 15939.2 },
    'broker_commissions/legacy_random_id': { contractId: 'e2e_c2', status: 'APPROVED', amount: 500 },
    'broker_commissions/commission_e2e_c2': { contractId: 'e2e_c2', status: 'PAID', amount: 500 },
    'broker_commissions/commission_real_c': { contractId: 'real_c', status: 'PENDING', amount: 900 },
  });

  const contractIds = await collectOwnerContractIds(db, 'e2e-owner');
  assert.deepEqual(contractIds.sort(), ['e2e_c1', 'e2e_c2']);

  const result = await cleanupBrokerCommissionsForContracts(db, contractIds, { now: () => 'NOW' });
  assert.deepEqual(result.deleted.sort(), ['commission_e2e_c1', 'legacy_random_id']);
  assert.deepEqual(result.voided, ['commission_e2e_c2']);

  assert.equal(db.store.has('broker_commissions/commission_e2e_c1'), false);
  assert.equal(db.store.has('broker_commissions/legacy_random_id'), false);
  const paid = db.store.get('broker_commissions/commission_e2e_c2');
  assert.equal(paid.status, 'VOID');
  assert.equal(paid.voided, true);
  assert.equal(paid.previousStatus, 'PAID');
  assert.equal(paid.voidReason, E2E_COMMISSION_VOID_REASON);
  assert.deepEqual(db.store.get('broker_commissions/commission_real_c'), { contractId: 'real_c', status: 'PENDING', amount: 900 });
});

test('a deterministic-id commission pointing at a different contract is not touched', async () => {
  const db = fakeDb({ 'broker_commissions/commission_e2e_c1': { contractId: 'other', status: 'PENDING' } });
  const result = await cleanupBrokerCommissionsForContracts(db, ['e2e_c1']);
  assert.deepEqual(result.skipped, ['commission_e2e_c1']);
  assert.equal(db.store.has('broker_commissions/commission_e2e_c1'), true);
});

test('no owner uid / no contracts is a no-op', async () => {
  const db = fakeDb({ 'broker_commissions/commission_x': { contractId: 'x', status: 'PENDING' } });
  assert.deepEqual(await collectOwnerContractIds(db, ''), []);
  const result = await cleanupBrokerCommissionsForContracts(db, []);
  assert.deepEqual(result, { deleted: [], voided: [], skipped: [] });
  assert.equal(db.store.size, 1);
});

const RUNNER_SOURCES = {
  'scripts/run-owner-inspection-first-production-evidence.mjs': fs.readFileSync('scripts/run-owner-inspection-first-production-evidence.mjs', 'utf8'),
  'scripts/run-owner-onboarding-production-evidence.mjs': fs.readFileSync('scripts/run-owner-onboarding-production-evidence.mjs', 'utf8'),
};

for (const [script, source] of Object.entries(RUNNER_SOURCES)) {
  test(`${script} cleans broker commissions before deleting the owner contracts`, () => {
    const fn = source.slice(source.indexOf('async function deleteOwnerScopedRecords(uid) {'));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    const collect = body.indexOf('collectOwnerContractIds(db, uid)');
    const cleanup = body.indexOf('cleanupBrokerCommissionsForContracts(db, contractIds');
    const contractDelete = body.indexOf('for (const collectionName of collections)');
    assert.ok(collect > 0 && cleanup > collect, 'commission cleanup must be wired into deleteOwnerScopedRecords');
    assert.ok(contractDelete > cleanup, 'commissions must be handled before contracts are deleted');
  });
}
