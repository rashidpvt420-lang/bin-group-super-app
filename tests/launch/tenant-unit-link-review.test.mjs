import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant unit-link Admin review requires rejection reason and preserves review evidence', async () => {
  const source = await read('apps/admin-panel/src/pages/ops/TenantUnitLinkQueuePage.tsx');
  assert.match(source, /reason\.trim\(\)\.length < 8/);
  assert.match(source, /reason:\s*rejectionReason\.trim\(\) \|\| null/);
  assert.match(source, /reviewReason \|\| requestRecord\.rejectionReason/);
  assert.match(source, /reviewedByEmail \|\| requestRecord\.reviewedBy/);
  assert.match(source, /Confirm rejection/);
  assert.match(source, /تأكيد الرفض/);
  assert.match(source, /dir=\{isRTL \? 'rtl' : 'ltr'\}/);
});
