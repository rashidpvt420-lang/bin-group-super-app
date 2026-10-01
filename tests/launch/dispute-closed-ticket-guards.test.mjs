import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('tenant and owner disputes enter the Admin PENDING_DISPUTE_REVIEW queue', () => {
  const tenant = read('functions/tenantTicketReview.ts');
  const owner = read('functions/index.ts');
  const resolve = read('functions/ticketDispatchOperations.ts');
  const queue = read('apps/admin-panel/src/pages/ops/DisputeQueuePage.tsx');
  const app = read('apps/admin-panel/src/App.tsx');
  const nav = read('apps/admin-panel/src/components/Navigation.tsx');
  const access = read('apps/admin-panel/src/security/staffAccessPolicy.ts');

  assert.match(tenant, /adminReviewStatus:\s*"PENDING_DISPUTE_REVIEW"/);
  assert.match(tenant, /disputeStatus:\s*"OPEN_ADMIN_REVIEW"/);
  assert.doesNotMatch(tenant, /adminReviewStatus:\s*"pending"/);
  assert.doesNotMatch(tenant, /disputeStatus:\s*"open"/);

  assert.match(owner, /adminReviewStatus:\s*"PENDING_DISPUTE_REVIEW"/);
  assert.match(owner, /disputeStatus:\s*"OPEN_ADMIN_REVIEW"/);
  assert.match(owner, /requiresAdminReview:\s*true/);
  assert.match(owner, /source:\s*"OWNER_REQUEST_REVISIT"/);
  assert.match(owner, /url:\s*"\/ops\/disputes"/);

  assert.match(resolve, /disputeStatus:\s*action === "request_revisit" \? "REOPENED_FOR_REVISIT" : "RESOLVED"/);
  assert.match(resolve, /status:\s*"CLOSED"/);
  assert.match(resolve, /source:\s*"ADMIN_DISPUTE_REVISIT"/);
  assert.match(resolve, /jobLocation:\s*ticket\.jobLocation/);
  assert.match(resolve, /requireMfaFinanceAdminActor/);
  assert.match(resolve, /requirePrivilegedMfaSession/);
  assert.match(queue, /adminReviewStatus',\s*'==',\s*'PENDING_DISPUTE_REVIEW'/);
  assert.match(app, /path="\/ops\/disputes"/);
  assert.match(app, /DisputeQueuePage/);
  assert.match(nav, /path:\s*'\/ops\/disputes'/);
  assert.match(access, /\/ops\/disputes/);
});

test('Owner financials and notifications expose invoice and receipt links', () => {
  const financials = read('src/owner/pages/OwnerFinancialsPage.tsx');
  const bell = read('src/components/NotificationBell.tsx');
  assert.match(financials, /navigate\(`\/invoices\/\$\{invoice\.id\}`\)/);
  assert.match(financials, /invoice\.pdfUrl/);
  assert.match(financials, /invoice\.receiptPdfUrl/);
  assert.match(bell, /handleOpenNotification/);
  assert.match(bell, /notif\.link/);
  assert.match(bell, /navigate\(link/);
});

test('Broker KYC release only clears payable RERA holds', () => {
  const kyc = read('functions/secureBrokerKycReview.ts');
  const commissions = read('functions/brokerCommissions.ts');
  assert.match(kyc, /BROKER_RERA_UNVERIFIED/);
  assert.match(kyc, /Number\(commission\.amount \|\| 0\) <= 0/);
  assert.match(commissions, /Math\.round\(base \* commissionRate \* 100\) \/ 100/);
  assert.doesNotMatch(commissions, /amount = commissionRateApproved \? Math\.round/);
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
