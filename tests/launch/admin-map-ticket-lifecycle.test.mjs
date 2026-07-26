import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lifecycleSource = readFileSync('functions/shared/maintenanceTicketLifecycle.js', 'utf8');
const adminMapSource = readFileSync('apps/admin-panel/src/pages/map/LiveMapPage.tsx', 'utf8');
const functionSource = readFileSync('functions/ticketNormalization.ts', 'utf8');
const lifecycle = await import(`data:text/javascript;base64,${Buffer.from(lifecycleSource).toString('base64')}`);

test('canonical lifecycle keeps every exceptional unresolved class visible', () => {
  for (const status of ['ESCALATED', 'REOPENED', 'ON_HOLD', 'WAITING_PARTS', 'DISPUTED']) {
    assert.equal(lifecycle.isUnresolvedMaintenanceTicketStatus(status), true, status);
    assert.ok(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(status));
    assert.ok(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(status.toLowerCase()));
  }
});

test('terminal lifecycle classes cannot enter unresolved map queries', () => {
  for (const status of ['COMPLETED', 'TENANT_APPROVED', 'RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED']) {
    assert.equal(lifecycle.isTerminalMaintenanceTicketStatus(status), true, status);
    assert.equal(lifecycle.isUnresolvedMaintenanceTicketStatus(status), false, status);
    assert.equal(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(status), false, status);
    assert.equal(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(status.toLowerCase()), false, status);
  }
});

test('Firestore status queries are bounded and cover the complete canonical query contract once', () => {
  const chunks = lifecycle.unresolvedMaintenanceTicketStatusQueryChunks();
  assert.ok(chunks.length > 1, 'the complete lifecycle should require multiple bounded queries');
  assert.ok(chunks.every((chunk) => chunk.length > 0 && chunk.length <= lifecycle.FIRESTORE_STATUS_IN_LIMIT));
  const flattened = chunks.flat();
  assert.deepEqual(flattened, lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES);
  assert.equal(new Set(flattened).size, flattened.length);
});

test('Admin and Functions consume the same executable lifecycle module', () => {
  assert.match(adminMapSource, /functions\/shared\/maintenanceTicketLifecycle/);
  assert.match(functionSource, /\.\/shared\/maintenanceTicketLifecycle/);
  assert.doesNotMatch(lifecycleSource, /\bas const\b|:\s*readonly\b|:\s*string\b/);
});

test('Admin map deterministically merges every bounded listener chunk', () => {
  assert.match(adminMapSource, /TICKET_STATUS_QUERY_CHUNKS = unresolvedMaintenanceTicketStatusQueryChunks\(\)/);
  assert.match(adminMapSource, /TICKET_STATUS_QUERY_CHUNKS\.map\(\(statuses, chunkIndex\)/);
  assert.match(adminMapSource, /where\('status', 'in', statuses\)/);
  assert.match(adminMapSource, /limit\(100\)/);
  assert.match(adminMapSource, /ticketSnapshots\.size !== TICKET_STATUS_QUERY_CHUNKS\.length/);
  assert.match(adminMapSource, /byId\.set\(String\(ticket\.id\), ticket\)/);
  assert.match(adminMapSource, /localeCompare\(String\(right\.id\)\)/);
  assert.match(adminMapSource, /isUnresolvedMaintenanceTicketStatus\(ticket\.status\)/);
});

test('Admin map fails closed on any chunk error and distinguishes loading, empty and error states', () => {
  assert.match(adminMapSource, /ticketListenerFailed = true/);
  assert.match(adminMapSource, /setTickets\(\[\]\)/);
  assert.match(adminMapSource, /Unresolved ticket query \$\{chunkIndex \+ 1\} of \$\{TICKET_STATUS_QUERY_CHUNKS\.length\} failed/);
  assert.match(adminMapSource, /const \[ticketsLoading, setTicketsLoading\] = useState\(true\)/);
  assert.match(adminMapSource, /ticketsLoading && !ticketsError/);
  assert.match(adminMapSource, /!ticketsLoading && !tickets\.length && !ticketsError/);
  assert.doesNotMatch(adminMapSource, /const ACTIVE_TICKET_STATUSES/);
});
