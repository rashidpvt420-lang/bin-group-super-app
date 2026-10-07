// Owner visibility: the Owner list only showed the assigned technician while a job was "active",
// in a white-on-white chip the white owner shell made invisible; status was a raw enum
// (PENDING_ASSIGNMENT, AUTO_ASSIGNED...); the dashboard had no complaint list; the detail page
// had no "assigned" step and no notice while nobody was assigned. Owners now see what the
// complaint is, the stage (Pending / Assigned / In progress / Solved), who is assigned,
// completion and photo evidence counts — live, on the dashboard, list and detail page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const list = read('src/owner/pages/OwnerTicketsPage.tsx');
const detail = read('src/owner/pages/OwnerTicketDetailPage.tsx');
const dashboard = read('src/owner/pages/OwnerSimpleDashboardPage.tsx');
const summary = read('src/owner/components/OwnerTicketStatusSummary.tsx');
const recent = read('src/owner/components/OwnerRecentComplaintsCard.tsx');
const helperSource = read('src/utils/ticketLifecycleStage.ts');

async function loadHelper() {
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

test('owner list shows stage, technician, completion and photos for every ticket', () => {
  assert.match(list, /<OwnerTicketStageChip ticket=\{ticket\} tx=\{tx\} \/>/);
  assert.match(list, /<OwnerTicketAssignmentLine ticket=\{ticket\} tx=\{tx\} \/>/);
  assert.doesNotMatch(list, /label=\{ticket\.assignedTechnicianName\}[\s\S]{0,200}color: '#FFF'/, 'no white-on-white technician chip');
  assert.doesNotMatch(list, /label=\{ticket\.status\?\.replace/);
  assert.match(summary, /ticket\.assignedTechnicianName/);
  assert.match(summary, /ticket\.completedAt/);
  assert.match(summary, /photoCount\(ticket\.photos\)/);
  assert.match(summary, /photoCount\(ticket\.afterPhotos\)/);
  assert.match(summary, /Awaiting technician assignment/);
  assert.doesNotMatch(summary, /color: '#FFF'|color: '#fff'|rgba\(255,\s*255,\s*255/);
});

test('owner dashboard lists the latest complaints live', () => {
  assert.match(dashboard, /import OwnerRecentComplaintsCard from '\.\.\/components\/OwnerRecentComplaintsCard';/);
  assert.match(dashboard, /<OwnerRecentComplaintsCard \/>/);
  assert.match(recent, /where\('ownerId', '==', user\.uid\), orderBy\('createdAt', 'desc'\), limit\(RECENT_LIMIT\)/);
  assert.match(recent, /onSnapshot\(q,/);
  assert.match(recent, /ticket\.description/);
  assert.match(recent, /<OwnerTicketStageChip ticket=\{ticket\}/);
  assert.match(recent, /setError\(err\?\.message/);
});

test('owner detail shows stage, pending notice, assignment and the assigned timeline step', () => {
  assert.match(detail, /<OwnerTicketStageChip ticket=\{ticket\} tx=\{tx\} \/>/);
  assert.match(detail, /data-testid="owner-ticket-pending-notice"/);
  assert.match(detail, /BIN GROUP operations has been alerted/);
  assert.match(detail, /ts: ticket\.assignedAt \|\| ticket\.autoAssignedAt/);
  assert.match(detail, /<OwnerTicketAssignmentLine ticket=\{ticket\} tx=\{tx\} \/>/);
  assert.doesNotMatch(detail, /'#FFF', fontWeight: 900 \}\}>\{ticket\.priority/);
});

test('owners see that operations is handling a stuck ticket, not the internal dispatch reason', () => {
  assert.match(summary, /Pending – BIN GROUP is arranging a technician/);
  assert.doesNotMatch(summary, /assignmentError|assignmentReasonCode/);
});

test('stage helper maps raw statuses to Pending / Assigned / In progress / Solved', async () => {
  const { ticketLifecycleStage } = await loadHelper();
  const cases = [
    [{ status: 'OPEN' }, 'PENDING'],
    [{ status: 'PENDING_ASSIGNMENT' }, 'PENDING'],
    [{ status: 'OPEN', dispatchStatus: 'PENDING_MANUAL_DISPATCH' }, 'PENDING'],
    [{ status: 'OPEN', assignedTechnicianId: 't1' }, 'ASSIGNED'],
    [{ status: 'ASSIGNED' }, 'ASSIGNED'],
    [{ status: 'ACCEPTED' }, 'ASSIGNED'],
    [{ status: 'EN_ROUTE' }, 'IN_PROGRESS'],
    [{ status: 'IN_PROGRESS' }, 'IN_PROGRESS'],
    [{ status: 'COMPLETED_PENDING_APPROVAL' }, 'AWAITING_APPROVAL'],
    [{ status: 'COMPLETED' }, 'SOLVED'],
    [{ status: 'closed' }, 'SOLVED'],
    [{ status: 'CANCELLED' }, 'CANCELLED'],
  ];
  for (const [ticket, stage] of cases) assert.equal(ticketLifecycleStage(ticket).stage, stage, JSON.stringify(ticket));
  assert.equal(ticketLifecycleStage(cases[2][0]).needsManualDispatch, true);
  assert.equal(ticketLifecycleStage(cases[3][0]).assigned, true);
});
