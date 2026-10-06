import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const helperSrc = read('../../src/owner/utils/ownerTicketAttentionCounts.ts');
const countsSrc = read('../../src/owner/hooks/useOwnerCommandCounts.ts');
const stripSrc = read('../../src/components/OwnerApprovalCommandStrip.tsx');
const simpleSrc = read('../../src/owner/pages/OwnerSimpleDashboardPage.tsx');
const resolvedSrc = read('../../src/owner/pages/OwnerDashboardResolvedPage.tsx');

// Mirror of ownerTicketAttentionCounts.ts — keep in sync with the helper.
const OWNER_OPEN_TICKET_STATUSES = new Set([
  'OPEN',
  'PENDING_ASSIGNMENT',
  'ASSIGNED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'ESCALATED',
]);
const OWNER_HIGH_RISK_PRIORITIES = new Set(['EMERGENCY', 'CRITICAL', 'HIGH', 'URGENT']);

function normalizeOwnerTicketToken(value, fallback = '') {
  return String(value ?? fallback)
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function isOwnerOpenTicket(ticket) {
  if (!ticket) return false;
  const status = normalizeOwnerTicketToken(ticket.status, '');
  if (status) return OWNER_OPEN_TICKET_STATUSES.has(status);
  const tracking = normalizeOwnerTicketToken(ticket.trackingStatus, '');
  return tracking !== '' && OWNER_OPEN_TICKET_STATUSES.has(tracking);
}

function isOwnerHighRiskPriority(ticket) {
  if (!ticket) return false;
  if (ticket.isEmergency === true) return true;
  const category = normalizeOwnerTicketToken(ticket.category, '');
  if (category === 'EMERGENCY') return true;
  const priority = normalizeOwnerTicketToken(
    ticket.slaPriority || ticket.priority || ticket.severity || '',
    '',
  );
  return priority !== '' && OWNER_HIGH_RISK_PRIORITIES.has(priority);
}

function isOwnerHighRiskTicket(ticket) {
  return isOwnerOpenTicket(ticket) && isOwnerHighRiskPriority(ticket);
}

function countOwnerOpenTickets(tickets) {
  if (!Array.isArray(tickets)) return 0;
  return tickets.filter(isOwnerOpenTicket).length;
}

function countOwnerHighRiskTickets(tickets) {
  if (!Array.isArray(tickets)) return 0;
  return tickets.filter(isOwnerHighRiskTicket).length;
}

test('open statuses match advanced Open Maintenance Tasks set (9 values, Firestore in-safe)', () => {
  assert.equal(OWNER_OPEN_TICKET_STATUSES.size, 9);
  assert.ok(OWNER_OPEN_TICKET_STATUSES.size <= 10);
  assert.match(helperSrc, /OWNER_OPEN_TICKET_STATUSES/);
  assert.match(helperSrc, /WAITING_PARTS/);
  assert.match(helperSrc, /ESCALATED/);
  assert.match(helperSrc, /EN_ROUTE/);
  // Old narrow simple-only statuses must not be the sole definition anymore.
  assert.doesNotMatch(countsSrc, /WAITING_FOR_TECHNICIAN/);
  assert.doesNotMatch(countsSrc, /ON_SITE/);
});

test('five medium-priority open tickets count as open=5 high-risk=0 (live mismatch repro)', () => {
  const rows = [
    { status: 'OPEN', priority: 'medium' },
    { status: 'ASSIGNED', priority: 'MEDIUM' },
    { status: 'IN_PROGRESS', priority: 'normal' },
    { status: 'EN_ROUTE', priority: 'low' },
    { status: 'WAITING_PARTS', priority: '' },
    { status: 'COMPLETED', priority: 'HIGH' },
  ];
  assert.equal(countOwnerOpenTickets(rows), 5);
  assert.equal(countOwnerHighRiskTickets(rows), 0);
});

test('priority casing and CRITICAL/URGENT count as high-risk when open', () => {
  const rows = [
    { status: 'open', priority: 'High' },
    { status: 'Assigned', slaPriority: 'critical' },
    { status: 'IN_PROGRESS', priority: 'urgent' },
    { status: 'OPEN', category: 'emergency' },
    { status: 'OPEN', isEmergency: true, priority: 'low' },
    { status: 'CLOSED', priority: 'EMERGENCY' },
  ];
  assert.equal(countOwnerOpenTickets(rows), 5);
  assert.equal(countOwnerHighRiskTickets(rows), 5);
});

test('trackingStatus alone can mark a ticket open only when status is missing', () => {
  assert.equal(isOwnerOpenTicket({ trackingStatus: 'EN_ROUTE' }), true);
  assert.equal(isOwnerOpenTicket({ status: '', trackingStatus: 'ASSIGNED' }), true);
  assert.equal(isOwnerOpenTicket({ status: 'UNKNOWN', trackingStatus: 'EN_ROUTE' }), false);
  assert.equal(isOwnerOpenTicket({ status: 'CLOSED', trackingStatus: 'EN_ROUTE' }), false);
});

test('helper exports shared counters used by command counts and advanced dashboard', () => {
  assert.match(helperSrc, /export function countOwnerOpenTickets/);
  assert.match(helperSrc, /export function countOwnerHighRiskTickets/);
  assert.match(helperSrc, /export function isOwnerOpenTicket/);
  assert.match(countsSrc, /countOwnerOpenTickets/);
  assert.match(countsSrc, /countOwnerHighRiskTickets/);
  assert.match(countsSrc, /from '\.\.\/utils\/ownerTicketAttentionCounts'/);
  assert.match(countsSrc, /openTickets:/);
  assert.match(resolvedSrc, /countOwnerOpenTickets/);
  assert.match(resolvedSrc, /OWNER_OPEN_TICKET_STATUSES/);
  assert.match(resolvedSrc, /ACTIVE_TICKET_STATUS_LIST/);
});

test('command strip surfaces openTickets (not silent high-risk zero) and keeps high-risk help', () => {
  assert.match(stripSrc, /openTickets/);
  assert.match(stripSrc, /Open tickets/);
  assert.match(stripSrc, /openMaintenance/);
  assert.match(stripSrc, /high-risk of/);
  assert.match(simpleSrc, /openTickets=\{commandCounts\.openTickets\}/);
  assert.match(simpleSrc, /highRiskTickets=\{commandCounts\.highRiskTickets\}/);
  assert.match(simpleSrc, /Check open maintenance/);
  assert.match(simpleSrc, /count: openMaintenance/);
});
