// Admin Tickets page: an assignment failure showed a generic "Institutional Error" instead of the
// server's reason (readiness, GPS, MFA...), the list was a one-shot read (no live status), and a
// ticket that auto-dispatch could not assign looked like any other OPEN ticket. The page now shows
// the callable's message, listens live, and labels Pending / Assigned / In progress / Solved with
// the manual-dispatch reason.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const page = readFileSync(new URL('../../apps/admin-panel/src/pages/tickets/TicketsManagementPage.tsx', import.meta.url), 'utf8');
const helperSource = readFileSync(new URL('../../apps/admin-panel/src/lib/ticketLifecycleStage.ts', import.meta.url), 'utf8');

async function loadHelper() {
  const { default: ts } = await import('typescript');
  const js = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
  return import(`data:text/javascript,${encodeURIComponent(js)}`);
}

test('assignment failures surface the server reason, not a generic error', () => {
  assert.doesNotMatch(page, /Institutional Error: Failed to lock technician assignment/);
  assert.match(page, /setAssignError\(callableErrorMessage\(err, 'Failed to assign the technician\.'\)\)/);
  assert.match(page, /<Alert severity="error"[^>]*data-testid="assign-error">\{assignError\}<\/Alert>/);
  assert.match(page, /String\(err\?\.message \|\| ''\)/);
});

test('ticket list is live and highlights tickets that need manual dispatch', () => {
  assert.match(page, /onSnapshot\(q, \(snap\) =>/);
  assert.doesNotMatch(page, /const snap = await getDocs\(q\);\s*if \(!cancelled\) setTickets/);
  assert.match(page, /dispatchStatus: data\.dispatchStatus/);
  assert.match(page, /assignmentError: data\.assignmentError/);
  assert.match(page, /NEEDS MANUAL DISPATCH/);
  assert.match(page, /ticketLifecycleStage\(ticket\)\.label/);
  assert.match(page, /searchParams\.get\('ticketId'\)/);
});

test('technician picker uses the real duty flag instead of a field nobody writes', () => {
  assert.doesNotMatch(page, /isOffDuty/);
  assert.match(page, /tech\.onDuty === true/);
});

test('lifecycle stage maps raw statuses to Pending / Assigned / In progress / Solved', async () => {
  const { ticketLifecycleStage } = await loadHelper();
  const cases = [
    [{ status: 'OPEN' }, 'PENDING', false],
    [{ status: 'pending_assignment' }, 'PENDING', false],
    [{ status: 'OPEN', dispatchStatus: 'PENDING_MANUAL_DISPATCH', assignmentError: 'No technician is on duty.' }, 'PENDING', true],
    [{ status: 'OPEN', assignedTechnicianId: 'tech_1' }, 'ASSIGNED', false],
    [{ status: 'AUTO_ASSIGNED', assignedTechnicianId: 'tech_1' }, 'ASSIGNED', false],
    [{ status: 'ACCEPTED' }, 'ASSIGNED', false],
    [{ status: 'EN_ROUTE' }, 'IN_PROGRESS', false],
    [{ status: 'in progress' }, 'IN_PROGRESS', false],
    [{ status: 'ARRIVED' }, 'IN_PROGRESS', false],
    [{ status: 'COMPLETED_PENDING_APPROVAL' }, 'AWAITING_APPROVAL', false],
    [{ status: 'COMPLETED' }, 'SOLVED', false],
    [{ status: 'CLOSED' }, 'SOLVED', false],
    [{ status: 'RESOLVED' }, 'SOLVED', false],
    [{ status: 'CANCELLED' }, 'CANCELLED', false],
  ];
  for (const [ticket, stage, manual] of cases) {
    const result = ticketLifecycleStage(ticket);
    assert.equal(result.stage, stage, JSON.stringify(ticket));
    assert.equal(result.needsManualDispatch, manual, JSON.stringify(ticket));
  }
  assert.equal(ticketLifecycleStage(cases[2][0]).reason, 'No technician is on duty.');
  assert.equal(ticketLifecycleStage(null).stage, 'PENDING');
});
