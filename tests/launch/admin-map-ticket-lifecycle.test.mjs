import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const lifecycleSource = readFileSync('functions/shared/maintenanceTicketLifecycle.js', 'utf8');
const adminMapSource = readFileSync('apps/admin-panel/src/pages/map/LiveMapPage.tsx', 'utf8');
const functionSource = readFileSync('functions/ticketNormalization.ts', 'utf8');
const lifecycle = await import(`data:text/javascript;base64,${Buffer.from(lifecycleSource).toString('base64')}`);

test('canonical lifecycle keeps every exceptional unresolved class visible', () => {
  for (const status of [
    'ESCALATED',
    'REOPENED',
    'ON_HOLD',
    'WAITING_PARTS',
    'DISPUTED',
    'PENDING_SCHEDULING',
    'SCHEDULED',
    'QUOTE_REJECTED',
    'RESCHEDULE_REQUESTED',
    'CANCELLATION_REQUESTED',
  ]) {
    assert.equal(lifecycle.isUnresolvedMaintenanceTicketStatus(status), true, status);
    assert.ok(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(status));
    assert.ok(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(status.toLowerCase()));
  }
});

test('legacy unresolved aliases normalize to canonical unresolved states', () => {
  const aliases = { new: 'OPEN', dispatched: 'ASSIGNED', claimed: 'ACCEPTED', started: 'WORK_STARTED' };
  for (const [alias, canonical] of Object.entries(aliases)) {
    assert.equal(lifecycle.normalizeMaintenanceTicketStatus(alias), canonical, alias);
    assert.equal(lifecycle.isUnresolvedMaintenanceTicketStatus(alias), true, alias);
    assert.ok(lifecycle.UNRESOLVED_MAINTENANCE_TICKET_QUERY_VALUES.includes(alias));
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

test('Admin map merges complete status, Technician and GPS listeners without silent truncation', () => {
  assert.match(adminMapSource, /TICKET_STATUS_QUERY_CHUNKS = unresolvedMaintenanceTicketStatusQueryChunks\(\)/);
  assert.match(adminMapSource, /TICKET_STATUS_QUERY_CHUNKS\.map\(\(statuses, chunkIndex\)/);
  assert.match(adminMapSource, /where\('status', 'in', statuses\)/);
  assert.doesNotMatch(adminMapSource, /where\('status', 'in', statuses\),\s*limit\(100\)/);
  assert.doesNotMatch(adminMapSource, /where\('status', 'in', statuses\)[\s\S]{0,80}limit\(/);
  assert.match(adminMapSource, /onSnapshot\(collection\(db, 'technicians'\)/);
  assert.match(adminMapSource, /query\(collection\(db, 'technician_live_locations'\), where\('isTracking', '==', true\)\)/);
  assert.doesNotMatch(adminMapSource, /limit\(100\)|limit\(200\)|limit\(101\)|limit\(201\)/);
  assert.match(adminMapSource, /ticketSnapshots\.size !== TICKET_STATUS_QUERY_CHUNKS\.length/);
  assert.match(adminMapSource, /byId\.set\(String\(ticket\.id\), ticket\)/);
  assert.match(adminMapSource, /localeCompare\(String\(right\.id\)\)/);
  assert.match(adminMapSource, /isUnresolvedMaintenanceTicketStatus\(ticket\.status\)/);
  assert.match(adminMapSource, /unsubscribeTickets\.forEach\(\(unsubscribe\) => unsubscribe\(\)\)/);
});

test('Admin map fails closed on any chunk error and distinguishes loading, empty and error states', () => {
  assert.match(adminMapSource, /ticketListenerFailed = true/);
  assert.match(adminMapSource, /setTickets\(\[\]\)/);
  assert.match(adminMapSource, /Unresolved ticket query \$\{chunkIndex \+ 1\} of \$\{TICKET_STATUS_QUERY_CHUNKS\.length\} failed/);
  assert.match(adminMapSource, /const \[ticketsLoading, setTicketsLoading\] = useState\(true\)/);
  assert.match(adminMapSource, /ticketsLoading \? <Box/);
  assert.match(adminMapSource, /!tickets\.length && !ticketsError/);
  assert.doesNotMatch(adminMapSource, /const ACTIVE_TICKET_STATUSES/);
});
