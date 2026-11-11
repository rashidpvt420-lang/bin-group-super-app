import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTsModules } from './helpers/load-ts-module.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const math = await loadTsModules(path.join(root, 'functions/summaryCounterMath.ts'));

test('open ticket status treats cancelled and completed as closed', () => {
  assert.equal(math.isOpenTicketStatus('OPEN'), true);
  assert.equal(math.isOpenTicketStatus('ASSIGNED'), true);
  assert.equal(math.isOpenTicketStatus('IN_PROGRESS'), true);
  assert.equal(math.isOpenTicketStatus('COMPLETED'), false);
  assert.equal(math.isOpenTicketStatus('closed'), false);
  assert.equal(math.isOpenTicketStatus('CANCELLED'), false);
  assert.equal(math.isOpenTicketStatus('canceled'), false);
});

test('open ticket delta is incremental, not a full recount', () => {
  assert.equal(math.openTicketDelta(null, { status: 'OPEN' }), 1);
  assert.equal(math.openTicketDelta({ status: 'OPEN' }, { status: 'COMPLETED' }), -1);
  assert.equal(math.openTicketDelta({ status: 'IN_PROGRESS' }, { status: 'ARRIVED' }), 0);
  assert.equal(math.openTicketDelta({ status: 'CLOSED' }, { status: 'OPEN' }), 1);
  assert.equal(math.openTicketDelta({ status: 'OPEN' }, null), -1);
});

test('owner adjustments move the count when the owner changes', () => {
  const moved = math.ownerOpenTicketAdjustments(
    { status: 'OPEN', ownerId: 'owner_a' },
    { status: 'OPEN', ownerId: 'owner_b' },
  );
  assert.deepEqual(moved.sort((a, b) => a.ownerId.localeCompare(b.ownerId)), [
    { ownerId: 'owner_a', delta: -1 },
    { ownerId: 'owner_b', delta: 1 },
  ]);
  assert.deepEqual(
    math.ownerOpenTicketAdjustments({ status: 'OPEN', ownerId: 'owner_a' }, { status: 'CLOSED', ownerId: 'owner_a' }),
    [{ ownerId: 'owner_a', delta: -1 }],
  );
  assert.deepEqual(
    math.ownerOpenTicketAdjustments({ status: 'IN_PROGRESS', ownerId: 'owner_a' }, { status: 'ASSIGNED', ownerId: 'owner_a' }),
    [],
  );
});

test('shard ids are stable and spread across the configured range', () => {
  const a = math.shardIdFor('tkt_00001');
  const b = math.shardIdFor('tkt_00001');
  assert.equal(a, b);
  const seen = new Set(Array.from({ length: 200 }, (_, i) => math.shardIdFor(`tkt_${i}`)));
  assert.ok(seen.size > 8, `expected shards to spread, got ${seen.size}`);
  for (const id of seen) {
    const n = Number(id);
    assert.ok(n >= 0 && n < math.ADMIN_OPEN_TICKET_SHARD_COUNT);
  }
});
