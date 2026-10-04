// Gap 13: tickets written with lowercase `pending_assignment` (dispatch path when a property has
// no verified geo) or `open` were invisible to the owner dashboard counts because status matching
// was exact-case. #1587 normalises its new stage card/list; this covers the dashboard counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTypeScriptModule(path) {
  const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  vm.runInContext(compiled, vm.createContext({ module, exports: module.exports, String, Set }), { filename: path });
  return module.exports;
}

const helperPath = 'src/owner/utils/ownerActiveTicketStatus.ts';

test('owner active-ticket matching is case and format insensitive', () => {
  const { isOwnerActiveTicket, isOwnerActiveTicketStatus, OWNER_ACTIVE_TICKET_STATUS_QUERY_VALUES } = loadTypeScriptModule(helperPath);
  for (const status of ['pending_assignment', 'PENDING_ASSIGNMENT', 'Pending Assignment', 'pending-assignment', 'open', 'OPEN', 'assigned', 'in_progress', 'waiting_for_technician', 'on_site']) {
    assert.equal(isOwnerActiveTicketStatus(status), true, status);
  }
  for (const status of ['completed', 'COMPLETED', 'closed', 'cancelled', 'TENANT_APPROVED', 'resolved']) {
    assert.equal(isOwnerActiveTicketStatus(status), false, status);
  }
  assert.equal(isOwnerActiveTicket({}), true, 'missing status defaults to OPEN as before');
  assert.equal(isOwnerActiveTicket({ status: 'completed', trackingStatus: 'in_progress' }), true);
  assert.equal(isOwnerActiveTicket({ status: 'completed' }), false);
  const values = [...OWNER_ACTIVE_TICKET_STATUS_QUERY_VALUES];
  assert.ok(values.includes('pending_assignment') && values.includes('PENDING_ASSIGNMENT') && values.includes('open'));
  assert.ok(values.length <= 30, 'Firestore `in` filters accept at most 30 values');
  assert.equal(new Set(values).size, values.length);
});

test('owner dashboard counters use the normalised matcher, not exact-case sets', () => {
  const hook = readFileSync('src/owner/hooks/useOwnerCommandCounts.ts', 'utf8');
  assert.match(hook, /from '\.\.\/utils\/ownerActiveTicketStatus'/);
  assert.match(hook, /rows\.filter\(\(ticket\) => isOwnerActiveTicket\(ticket\)\)/);
  assert.doesNotMatch(hook, /OPEN_TICKET_STATUSES/);

  const resolved = readFileSync('src/owner/pages/OwnerDashboardResolvedPage.tsx', 'utf8');
  assert.match(resolved, /where\('status', 'in', \[\.\.\.OWNER_ACTIVE_TICKET_STATUS_QUERY_VALUES\]\)/);
  assert.doesNotMatch(resolved, /where\('status', 'in', \['OPEN', 'PENDING_ASSIGNMENT'/);
  assert.match(resolved, /isOwnerActiveTicketStatus\(ticket\.status\)/);
});
