import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(p, 'utf8');

test('heavy owner unit registry is paginated, not an unbounded owner query', () => {
  const lib = read('src/lib/pagedQuery.ts');
  assert.match(lib, /export const LIST_PAGE_SIZE = 100/);
  assert.match(read('src/lib/firebase.ts'), /export \{ fetchPage, LIST_PAGE_SIZE \} from '.\/pagedQuery'/);
  assert.match(lib, /limit\(size \+ 1\)/);
  assert.match(lib, /startAfter\(cursor\)/);
  const page = read('src/owner/pages/OwnerUnitRegistryPage.tsx');
  assert.doesNotMatch(page, /getDocs\(query\(collection\(db, 'units'\), where\('ownerId', '==', user\.uid\)\)\)/);
  assert.match(page, /fetchPage\(query\(collection\(db, 'units'\), where\('ownerId', '==', user\.uid\)\), null, LIST_PAGE_SIZE\)/);
  assert.match(page, /units-load-more/);
  assert.match(page, /تحميل المزيد من الوحدات/);
});

test('declared units above 200 use resumable batches with a hard ceiling', () => {
  const src = read('functions/propertyUnitRecords.ts');
  assert.match(src, /MAX_AUTO_PROVISIONED_UNITS = 200/);
  assert.match(src, /UNIT_PROVISION_BATCH_SIZE = 200/);
  assert.match(src, /MAX_BATCHED_PROVISIONED_UNITS = 2000/);
  assert.match(src, /state: "IN_PROGRESS"/);
  assert.match(src, /FAILED_COLLISION/);
});
