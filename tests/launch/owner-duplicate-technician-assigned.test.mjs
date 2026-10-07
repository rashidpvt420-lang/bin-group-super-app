// Regression: the Owner bell showed "Technician Assigned" twice for ticket
// #4ETECBEM. onTicketStatusChanged emitted it on OPEN -> ASSIGNED
// (auto-assignment, autoAssignedAt 14:03:38Z) and again on ASSIGNED -> ACCEPTED
// (technician accept, acceptedAt 14:04:00Z), each time with a random
// notifications/ doc ID. It must now deliver once per assignment, idempotently,
// while genuine re-assignments still notify.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');

function loadShared(relative) {
  const compiled = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: relative,
  }).outputText;
  const sandbox = { exports: {}, Date, Math, Number, String, Set, require: (id) => { throw new Error(`unexpected import ${id}`); } };
  runInNewContext(compiled, sandbox, { filename: relative });
  return sandbox.exports;
}

const {
  isTechnicianAssignmentEvent,
  technicianAssignedNotificationSeed,
  assignmentEpoch,
} = loadShared('functions/shared/technicianAssignmentNotification.ts');

const ts_ = (iso) => ({ toMillis: () => Date.parse(iso) });
const TICKET_ID = '4EtEcbEMu1lUynUKtpMd';
const OWNER = 'owner-uid';
const TECH_A = 'koFjPljsrCQ2p8uMIwRDJ2fhKth2';
const TECH_B = 'tech-b-uid';

/** Mirror of the onTicketStatusChanged assignment branch + create()-based delivery. */
function makeTrigger() {
  const notifications = new Map();
  const deliveries = [];
  const fire = (ticketId, before, after) => {
    if (!isTechnicianAssignmentEvent(before, after)) return;
    const seed = technicianAssignedNotificationSeed(ticketId, after.ownerId, 'owner', after);
    const id = `tech_assigned_${createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, 40)}`;
    if (notifications.has(id)) return; // create() -> ALREADY_EXISTS: nothing re-sent
    notifications.set(id, { recipientId: after.ownerId, title: 'Technician Assigned ✓', technicianId: after.assignedTechnicianId });
    deliveries.push(id);
  };
  return { fire, notifications, deliveries };
}

const opened = { status: 'OPEN', ownerId: OWNER, assignedTechnicianId: null };
const autoAssigned = { ...opened, status: 'ASSIGNED', assignedTechnicianId: TECH_A, technicianId: TECH_A, autoAssignedAt: ts_('2026-10-06T14:03:38.885Z') };
const accepted = { ...autoAssigned, status: 'ACCEPTED', acceptedAt: ts_('2026-10-06T14:04:00.339Z') };

test('auto-assign then technician accept delivers exactly one Technician Assigned notification', () => {
  const trigger = makeTrigger();
  trigger.fire(TICKET_ID, opened, autoAssigned);
  trigger.fire(TICKET_ID, autoAssigned, accepted);
  assert.equal(trigger.deliveries.length, 1);
  assert.equal(
    technicianAssignedNotificationSeed(TICKET_ID, OWNER, 'owner', autoAssigned),
    technicianAssignedNotificationSeed(TICKET_ID, OWNER, 'owner', accepted),
  );
});

test('trigger retries of the same event are idempotent', () => {
  const trigger = makeTrigger();
  trigger.fire(TICKET_ID, opened, autoAssigned);
  trigger.fire(TICKET_ID, opened, autoAssigned);
  trigger.fire(TICKET_ID, autoAssigned, accepted);
  trigger.fire(TICKET_ID, autoAssigned, accepted);
  assert.equal(trigger.deliveries.length, 1);
});

test('dispatch assignment then accept also collapses to one notification', () => {
  const trigger = makeTrigger();
  const dispatched = { ...opened, status: 'ASSIGNED', assignedTechnicianId: TECH_A, assignedAt: ts_('2026-10-06T10:00:00Z') };
  trigger.fire(TICKET_ID, opened, dispatched);
  trigger.fire(TICKET_ID, dispatched, { ...dispatched, status: 'ACCEPTED', acceptedAt: ts_('2026-10-06T10:01:00Z') });
  assert.equal(trigger.deliveries.length, 1);
});

test('genuine re-assignments still notify the owner', () => {
  const trigger = makeTrigger();
  trigger.fire(TICKET_ID, opened, autoAssigned);
  trigger.fire(TICKET_ID, autoAssigned, accepted);
  // Admin re-assigns an accepted mission to another technician (status ACCEPTED -> ASSIGNED).
  const reassigned = { ...accepted, status: 'ASSIGNED', assignedTechnicianId: TECH_B, technicianId: TECH_B, assignedAt: ts_('2026-10-06T15:00:00Z') };
  trigger.fire(TICKET_ID, accepted, reassigned);
  assert.equal(trigger.deliveries.length, 2);
  // Re-assignment while still ASSIGNED (no status change) back to TECH_A with a fresh assignment.
  const reassignedAgain = { ...reassigned, assignedTechnicianId: TECH_A, technicianId: TECH_A, assignedAt: ts_('2026-10-06T16:00:00Z') };
  assert.equal(isTechnicianAssignmentEvent(reassigned, reassignedAgain), true);
  trigger.fire(TICKET_ID, reassigned, reassignedAgain);
  assert.equal(trigger.deliveries.length, 3);
  // The new technician accepting does not re-notify.
  trigger.fire(TICKET_ID, reassignedAgain, { ...reassignedAgain, status: 'ACCEPTED', acceptedAt: ts_('2026-10-06T16:02:00Z') });
  assert.equal(trigger.deliveries.length, 3);
});

test('assignment keys are scoped per recipient and per assignment epoch', () => {
  assert.notEqual(
    technicianAssignedNotificationSeed(TICKET_ID, OWNER, 'owner', autoAssigned),
    technicianAssignedNotificationSeed(TICKET_ID, 'tenant-uid', 'tenant', autoAssigned),
  );
  assert.equal(technicianAssignedNotificationSeed(TICKET_ID, OWNER, 'owner', opened), null);
  // Latest of assignedAt / autoAssignedAt wins; acceptedAt only for self-claims.
  assert.equal(assignmentEpoch({ autoAssignedAt: ts_('2026-10-06T14:03:38.885Z'), acceptedAt: ts_('2026-10-06T14:04:00Z') }), String(Date.parse('2026-10-06T14:03:38.885Z')));
  assert.equal(assignmentEpoch({ assignedAt: { seconds: 100, nanoseconds: 0 }, autoAssignedAt: { seconds: 50 } }), '100000');
  assert.equal(assignmentEpoch({ acceptedAt: { _seconds: 7 } }), '7000');
  assert.equal(assignmentEpoch({}), 'unversioned');
});

test('non-assignment updates are not treated as assignments', () => {
  assert.equal(isTechnicianAssignmentEvent(accepted, { ...accepted, status: 'EN_ROUTE' }), false);
  assert.equal(isTechnicianAssignmentEvent(accepted, { ...accepted, assignedTechnicianName: 'rashid' }), false);
  assert.equal(isTechnicianAssignmentEvent(opened, { ...opened, description: 'edited' }), false);
});

test('onTicketStatusChanged delivers Technician Assigned through a deterministic, create()-guarded ID', () => {
  const source = read('functions/index.ts');
  assert.match(source, /from "\.\/shared\/technicianAssignmentNotification"/);
  assert.doesNotMatch(source, /if \(\["accepted", "assigned", "technician_assigned"\]\.includes\(statusNorm\)\)/);
  assert.match(source, /const technicianAssignmentEvent = isTechnicianAssignmentEvent\(before, after\);/);
  assert.match(source, /if \(!statusChanged && !technicianAssignmentEvent\) return;/);
  assert.match(source, /technicianAssignedNotificationSeed\(ticketId, recipientId, audience, after\)/);
  assert.match(source, /notifyRequester\("Technician Assigned ✓", [^\n]*\{ oncePerAssignment: true \}\);/);
  assert.match(source, /notificationId: idFor\(ownerId, "owner"\)/);
  assert.match(source, /notificationId: idFor\(tenantId, "tenant"\)/);

  const omni = source.slice(source.indexOf('async function dispatchOmniNotification'));
  const createAt = omni.indexOf(".doc(notificationId).create(");
  const smsAt = omni.indexOf('sendTwilioSMS(');
  assert.ok(createAt > 0, 'deterministic notification create() is required');
  assert.ok(smsAt > createAt, 'dedupe must run before SMS/email channels');
  assert.match(omni.slice(createAt, smsAt), /already-exists[\s\S]*return;/);
  // Notifications without an idempotency key keep the original add() path.
  assert.match(omni, /db\.collection\('notifications'\)\.add\(notificationRecord\)/);
});
