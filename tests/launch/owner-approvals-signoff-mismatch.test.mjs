import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const helper = read('../../src/owner/utils/ownerPendingSignOff.ts');
const counts = read('../../src/owner/hooks/useOwnerCommandCounts.ts');
const approvals = read('../../src/owner/pages/OwnerApprovalCenterPage.tsx');
const strip = read('../../src/components/OwnerApprovalCommandStrip.tsx');
const ticketDetail = read('../../src/owner/pages/OwnerTicketDetailPage.tsx');

// Mirror of src/owner/utils/ownerPendingSignOff.ts — keep in sync with that helper.
const OWNER_PENDING_SIGNOFF_STATUSES = new Set([
  'COMPLETED',
  'COMPLETED_PENDING_APPROVAL',
  'COMPLETED_PENDING_TENANT_APPROVAL',
  'RESOLVED',
]);

function normalizeOwnerTicketStatus(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function isOwnerPendingSignOff(ticket) {
  if (!ticket) return false;
  if (ticket.ownerApproved === true) return false;
  return OWNER_PENDING_SIGNOFF_STATUSES.has(normalizeOwnerTicketStatus(ticket.status));
}

test('spaced COMPLETED PENDING APPROVAL counts as pending owner sign-off', () => {
  assert.equal(isOwnerPendingSignOff({ status: 'COMPLETED PENDING APPROVAL' }), true);
  assert.equal(isOwnerPendingSignOff({ status: 'COMPLETED_PENDING_APPROVAL' }), true);
  assert.equal(isOwnerPendingSignOff({ status: 'COMPLETED_PENDING_APPROVAL', ownerApproved: true }), false);
  assert.equal(isOwnerPendingSignOff({ status: 'CLOSED' }), false);
  assert.equal(isOwnerPendingSignOff({ status: 'IN_PROGRESS' }), false);
});

test('shared helper exports COMPLETED_PENDING_APPROVAL sign-off gate', () => {
  assert.match(helper, /COMPLETED_PENDING_APPROVAL/);
  assert.match(helper, /export function isOwnerPendingSignOff/);
  assert.match(helper, /export function countOwnerPendingSignOffs/);
  assert.match(helper, /replace\(\/\[\\s-\]\+\/g, '_'\)/);
});

test('command counts add ticket sign-offs into pending approvals', () => {
  assert.match(counts, /countOwnerPendingSignOffs/);
  assert.match(counts, /from '\.\.\/utils\/ownerPendingSignOff'/);
  assert.match(counts, /_pendingTicketSignOffs/);
  assert.match(counts, /pendingCostApprovals:\s*pendingCostRequests\s*\+\s*pendingTicketSignOffs/);
});

test('Approval Center lists ticket sign-offs and Approve & Close', () => {
  assert.match(approvals, /isOwnerPendingSignOff/);
  assert.match(approvals, /collection\(db, 'maintenanceTickets'\)/);
  assert.match(approvals, /ownerReviewTicketCompletion/);
  assert.match(approvals, /Approve & Close/);
  assert.match(approvals, /Ticket sign-offs/);
  assert.match(approvals, /\/owner\/ticket\//);
});

test('command strip still routes pending approvals to /owner/approvals', () => {
  assert.match(strip, /route: '\/owner\/approvals'/);
  assert.match(strip, /Pending approvals/);
  assert.match(strip, /pendingCostApprovals/);
});

test('ticket detail Approve & Close gate uses shared sign-off helper', () => {
  assert.match(ticketDetail, /isOwnerPendingSignOff/);
  assert.match(ticketDetail, /from '\.\.\/utils\/ownerPendingSignOff'/);
  assert.match(ticketDetail, /const canReviewCompleted = isOwnerPendingSignOff\(ticket\);/);
});
