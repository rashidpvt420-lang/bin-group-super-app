import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const helperSrc = read('../../src/owner/utils/ownerTicketAttentionCounts.ts');
const resolvedSrc = read('../../src/owner/pages/OwnerDashboardResolvedPage.tsx');
const dispatchSrc = read('../../functions/index.ts');

test('owner open-ticket query includes the lowercase statuses dispatch still writes', () => {
  const block = helperSrc.slice(helperSrc.indexOf('OWNER_OPEN_TICKET_QUERY_VALUES'));
  const values = block.slice(0, block.indexOf('];'));
  assert.match(values, /'pending_assignment'/);
  assert.match(values, /'open'/);
  assert.match(values, /OWNER_OPEN_TICKET_STATUSES/);
  if (/status: "pending_assignment"/.test(dispatchSrc)) assert.match(values, /'pending_assignment'/);
});

test('advanced Owner dashboard listener uses the case-inclusive query values', () => {
  assert.match(resolvedSrc, /const ACTIVE_TICKET_STATUS_LIST = OWNER_OPEN_TICKET_QUERY_VALUES;/);
  assert.match(resolvedSrc, /where\('status', 'in', ACTIVE_TICKET_STATUS_LIST\)/);
});
