import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('tenant and owner disputes enter the Admin PENDING_DISPUTE_REVIEW queue', () => {
  const tenant = read('functions/tenantTicketReview.ts');
  const owner = read('functions/index.ts');
  const resolve = read('functions/ticketDispatchOperations.ts');
  const queue = read('apps/admin-panel/src/pages/ops/DisputeQueuePage.tsx');

  assert.match(tenant, /adminReviewStatus:\s*"PENDING_DISPUTE_REVIEW"/);
  assert.match(tenant, /disputeStatus:\s*"OPEN_ADMIN_REVIEW"/);
  assert.doesNotMatch(tenant, /adminReviewStatus:\s*"pending"/);
  assert.doesNotMatch(tenant, /disputeStatus:\s*"open"/);

  assert.match(owner, /adminReviewStatus:\s*"PENDING_DISPUTE_REVIEW"/);
  assert.match(owner, /disputeStatus:\s*"OPEN_ADMIN_REVIEW"/);
  assert.match(owner, /requiresAdminReview:\s*true/);

  assert.match(resolve, /disputeStatus:\s*action === "request_revisit" \? "REOPENED_FOR_REVISIT" : "RESOLVED"/);
  assert.match(queue, /adminReviewStatus',\s*'==',\s*'PENDING_DISPUTE_REVIEW'/);
});

test('closed and disputed tickets cannot be recreated or redispatched', () => {
  const tenantCreate = read('functions/tenantTicketOperations.ts');
  const dispatch = read('functions/ticketDispatchOperations.ts');
  const secureAssign = read('functions/secureAdminTechnicianAssignment.ts');
  const rules = read('firestore.rules');

  assert.match(tenantCreate, /already bound to a closed ticket/);
  assert.match(tenantCreate, /\["CLOSED", "CANCELLED", "REJECTED", "RESOLVED"\]/);
  assert.match(dispatch, /NON_DISPATCHABLE_STATUSES/);
  assert.match(dispatch, /DISPUTED/);
  assert.match(secureAssign, /NON_DISPATCHABLE_STATUSES/);
  assert.match(secureAssign, /DISPUTED/);
  assert.match(rules, /function safeAdminTicketCreate\(\)/);
  assert.match(rules, /function safeAdminTicketUpdate\(\)/);
  assert.match(rules, /allow create: if safeAdminTicketCreate\(\);/);
});
