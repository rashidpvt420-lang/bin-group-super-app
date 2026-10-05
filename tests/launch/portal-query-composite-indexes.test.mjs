import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Live portal queries that combine an equality/`in` filter with orderBy on a
// different field need a composite index. Without it Firestore rejects the
// listener with "The query requires an index" (seen on /owner/tickets on
// bin-group-57c60, 2026-10-04). Each entry pins the query shape in source and
// requires a matching declaration in firestore.indexes.json.
const REQUIRED = [
  {
    file: 'src/owner/pages/OwnerTicketsPage.tsx',
    collection: 'maintenanceTickets',
    equality: ['ownerId'],
    order: [['createdAt', 'DESCENDING']],
    shape: /collection\(db, 'maintenanceTickets'\),\s*where\('ownerId', '==', user\.uid\),\s*orderBy\('createdAt', 'desc'\)/,
  },
  {
    file: 'src/technician/pages/TechnicianHistoryPage.tsx',
    collection: 'maintenanceTickets',
    equality: ['assignedTechnicianId', 'status'],
    order: [['updatedAt', 'DESCENDING']],
    shape: /where\('assignedTechnicianId', '==', user\.uid\),\s*where\('status', 'in', \[[^\]]*\]\),\s*orderBy\('updatedAt', 'desc'\)/,
  },
  {
    file: 'src/owner/pages/OwnerApprovalCenterPage.tsx',
    collection: 'owner_approval_requests',
    equality: ['ownerId'],
    order: [['createdAt', 'DESCENDING']],
    shape: /collection\(db, 'owner_approval_requests'\), where\('ownerId', '==', ownerId\), orderBy\('createdAt', 'desc'\)/,
  },
];

const indexes = JSON.parse(readFileSync('firestore.indexes.json', 'utf8')).indexes;

function declares({ collection, equality, order }) {
  return indexes.some((index) => {
    if (index.collectionGroup !== collection || index.queryScope !== 'COLLECTION') return false;
    const fields = index.fields.filter((field) => field.fieldPath !== '__name__');
    if (fields.length !== equality.length + order.length) return false;
    const head = fields.slice(0, equality.length).map((field) => field.fieldPath).sort();
    if (head.join() !== [...equality].sort().join()) return false;
    return order.every(([fieldPath, direction], i) => {
      const field = fields[equality.length + i];
      return field.fieldPath === fieldPath && field.order === direction;
    });
  });
}

for (const required of REQUIRED) {
  test(`${required.file} query on ${required.collection} has a declared composite index`, () => {
    const source = readFileSync(required.file, 'utf8');
    assert.match(source, required.shape, 'query shape changed; update this test and firestore.indexes.json together');
    assert.ok(
      declares(required),
      `firestore.indexes.json is missing ${required.collection} (${[...required.equality, ...required.order.map(([f, d]) => `${f} ${d}`)].join(', ')})`,
    );
  });
}

test('firestore.indexes.json has no duplicate composite indexes', () => {
  const keys = indexes.map((index) => JSON.stringify([index.collectionGroup, index.queryScope, index.fields]));
  assert.equal(new Set(keys).size, keys.length);
});
