// Rashid, 19 Nov 2026: every Owner / Tenant / Broker request must reach staff, and the Founder
// (Super Admin) and Admin accounts must be alerted about everything, with a push that arrives when
// the app is closed. These tests pin the central planner, role scoping, privacy and wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const ts = createRequire(import.meta.url)('typescript');
function loadShared(relative) {
  const compiled = ts.transpileModule(read(relative), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: relative }).outputText;
  const sandbox = { exports: {}, Set, String, Object, encodeURIComponent, require: (id) => { throw new Error(`unexpected import ${id}`); } };
  runInNewContext(compiled, sandbox, { filename: relative });
  return sandbox.exports;
}
const core = loadShared('functions/shared/staffEventAlertsCore.ts');
const { planDocumentAlert, planChatAlert, selectRecipients, ALERT_REGISTRY, LEADERSHIP_ROLES, rolesFor, cleanText } = core;
const plain = (value) => JSON.parse(JSON.stringify(value));

test('every Owner / Tenant / Broker request collection is registered and alerts on create', () => {
  const requests = [
    'properties', 'intake_submissions', 'owner_registration_requests', 'contracts', 'documents', 'tenant_unit_link_requests',
    'maintenanceRequests', 'move_out_requests', 'inspections', 'tenant_services_requests', 'amenityBookings',
    'paymentConfirmations', 'payment_transactions', 'payout_change_alerts', 'design_requests', 'painting_projects',
    'brokerLeads', 'brokerReferrals', 'broker_payout_requests', 'brokerDocuments', 'support_chats',
    'accountDeletionRequests', 'user_suggestions', 'pilotFeedback', 'tenant_correction_requests', 'owner_correction_requests',
  ];
  for (const collection of requests) {
    const spec = ALERT_REGISTRY[collection];
    assert.ok(spec, `${collection} must be registered`);
    assert.equal(spec.onCreate, true, `${collection} must alert on create`);
    assert.equal(spec.request, true, `${collection} must use the e-mail fallback`);
  }
});

test('leadership (Founder / Super Admin, Admin, CEO) is on every alert; domain roles stay scoped', () => {
  for (const spec of Object.values(ALERT_REGISTRY)) {
    const roles = rolesFor(spec.domain);
    for (const role of LEADERSHIP_ROLES) assert.ok(roles.includes(role), `${spec.labelEn} must reach ${role}`);
  }
  assert.ok(!rolesFor('hr').includes('finance_admin'));
  assert.ok(!rolesFor('finance').includes('hr_admin'));
  assert.deepEqual(plain(rolesFor('security')).sort(), ['admin', 'ceo', 'super_admin']);
  assert.ok(!rolesFor('hr').includes('technician'));
});

test('a new property from an Owner produces a bilingual staff alert without free text', () => {
  const plan = planDocumentAlert({
    collection: 'properties', docId: 'propAbc12345xyz', before: null, eventId: 'e1',
    after: { propertyName: 'Marina Heights', unitNumber: '1203', requesterRole: 'owner', createdBy: 'owner1', description: 'call me on 0501234567', ownerIban: 'AE070331234567890123456' },
  });
  assert.equal(plan.kind, 'CREATED');
  assert.equal(plan.titleEn, 'New Property from Owner');
  assert.match(plan.titleAr, /عقار/);
  assert.match(plan.bodyEn, /Marina Heights, unit 1203/);
  assert.match(plan.bodyAr, /للمراجعة/);
  assert.equal(plan.emailFallback, true);
  assert.equal(plan.actorUid, 'owner1');
  const all = JSON.stringify(plan);
  assert.doesNotMatch(all, /0501234567|AE07|call me/);
  assert.doesNotMatch(all, /\bETA\b|minutes away|arriv/i);
});

test('status changes alert (cancellations, approvals, overdue), and copy never says the alert approved anything', () => {
  const plan = planDocumentAlert({ collection: 'payment_transactions', docId: 'pay1', eventId: 'ev9', before: { status: 'pending_verification' }, after: { status: 'approved', amount: 61648.93, updatedBy: 'fin1' } });
  assert.equal(plan.kind, 'STATUS_CHANGED');
  assert.match(plan.bodyEn, /PENDING_VERIFICATION → APPROVED/);
  assert.doesNotMatch(JSON.stringify(plan), /61648|61,648/);
  assert.equal(plan.actorUid, 'fin1');
  assert.ok(plan.roles.includes('finance_admin'));
  assert.equal(plan.emailFallback, false);
  assert.equal(planDocumentAlert({ collection: 'payment_transactions', docId: 'pay1', eventId: 'ev10', before: { status: 'approved', note: 'a' }, after: { status: 'approved', note: 'b' } }), null);
  const cancel = planDocumentAlert({ collection: 'contracts', docId: 'c1', eventId: 'e', before: { status: 'draft' }, after: { status: 'cancelled' } });
  assert.match(cancel.titleEn, /CANCELLED/);
});

test('ticket create / assignment / completion are not duplicated (ticketStakeholderNotifications already alerts admins)', () => {
  assert.equal(planDocumentAlert({ collection: 'maintenanceTickets', docId: 't1', eventId: 'e', before: null, after: { status: 'open' } }), null);
  assert.equal(planDocumentAlert({ collection: 'maintenanceTickets', docId: 't1', eventId: 'e', before: { status: 'open' }, after: { status: 'assigned' } }), null);
  assert.equal(planDocumentAlert({ collection: 'maintenanceTickets', docId: 't1', eventId: 'e', before: { status: 'in_progress' }, after: { status: 'completed' } }), null);
  const escalated = planDocumentAlert({ collection: 'maintenanceTickets', docId: 't1', eventId: 'e', before: { status: 'open' }, after: { status: 'escalated' } });
  assert.equal(escalated.kind, 'STATUS_CHANGED');
  const onTheWay = planDocumentAlert({ collection: 'maintenanceTickets', docId: 't1', eventId: 'e', before: { status: 'accepted' }, after: { status: 'on_the_way' } });
  assert.doesNotMatch(onTheWay.bodyEn, /\d+\s*min/i);
});

test('staff role / access changes reach leadership only; customer profile edits do not alert', () => {
  const plan = planDocumentAlert({ collection: 'users', docId: 'u1', eventId: 'e', before: { role: 'technician', status: 'active' }, after: { role: 'technician', status: 'suspended' } });
  assert.equal(plan.kind, 'STATUS_CHANGED');
  assert.deepEqual(plain(plan.roles).sort(), ['admin', 'ceo', 'super_admin']);
  assert.equal(planDocumentAlert({ collection: 'users', docId: 'u2', eventId: 'e', before: { role: 'tenant', status: 'a' }, after: { role: 'tenant', status: 'b' } }), null);
  const grant = planDocumentAlert({ collection: 'users', docId: 'u3', eventId: 'e', before: { role: 'finance_staff' }, after: { role: 'finance_admin' } });
  assert.match(grant.bodyEn, /role: FINANCE_STAFF → FINANCE_ADMIN/);
});

test('unregistered collections (notifications, mail, audit logs, live GPS) never alert, so there is no loop', () => {
  for (const collection of ['notifications', 'mail', 'audit_logs', 'technician_live_locations', 'telemetry_logs', 'contract_signature_otps', 'staffMoodCheckins']) {
    assert.equal(planDocumentAlert({ collection, docId: 'x', eventId: 'e', before: null, after: { status: 'x' } }), null, collection);
  }
  assert.equal(planDocumentAlert({ collection: 'properties', docId: 'x', eventId: 'e', before: { status: 'a' }, after: null }), null);
});

test('Owner / Tenant chat to staff alerts operations + leadership without copying the message', () => {
  const plan = planChatAlert({ parentCollection: 'maintenanceTickets', parentId: 'tk1', messageId: 'm1', message: { senderUid: 'ten1', senderRole: 'tenant', message: 'my OTP is 123456' } });
  assert.equal(plan.titleEn, 'New message from Tenant');
  assert.ok(plan.roles.includes('dispatcher') && plan.roles.includes('super_admin'));
  assert.doesNotMatch(JSON.stringify(plan), /123456|OTP/);
  assert.equal(plan.actorUid, 'ten1');
  assert.equal(planChatAlert({ parentCollection: 'maintenanceTickets', parentId: 'tk1', messageId: 'm2', message: { senderUid: 't', senderRole: 'technician', message: 'x' } }), null);
});

test('recipients skip suspended staff, the actor, and roles outside the alert', () => {
  const ids = selectRecipients([
    { uid: 'founder', role: 'super_admin' }, { uid: 'adm', role: 'admin' }, { uid: 'off', role: 'admin', suspended: true },
    { uid: 'gone', role: 'admin', status: 'disabled' }, { uid: 'hr', role: 'hr_admin' }, { uid: 'fin', role: 'finance_admin' },
  ], rolesFor('finance'), 'fin');
  assert.deepEqual(plain(ids).sort(), ['adm', 'founder']);
});

test('long digit runs (phones, IBAN, ID, OTP) are masked in any label that reaches the copy', () => {
  assert.equal(cleanText('Villa 0501234567'), 'Villa •••67');
  assert.equal(cleanText('Tower 12'), 'Tower 12');
});

test('fan-out is wired once, server-side, with deterministic ids and the push / e-mail fallback path', () => {
  const runtime = read('functions/runtimeAll.ts');
  assert.match(runtime, /export \{ fanOutStaffEventAlerts, fanOutStaffChatAlerts \} from '\.\/staffEventAlerts'/);
  const trigger = read('functions/staffEventAlerts.ts');
  assert.match(trigger, /document: "\{collectionId\}\/\{docId\}"/);
  assert.match(trigger, /ref\.create\(data\)/);
  assert.match(trigger, /deliverySource: "server:staffEventAlerts"/);
  assert.doesNotMatch(trigger, /\.set\(/);
  const delivery = read('functions/notificationDelivery.ts');
  assert.match(delivery, /android: \{\s*priority: "high"/);
  assert.match(delivery, /apns: \{\s*headers: \{ "apns-priority": "10" \}/);
  assert.match(delivery, /queueStaffAlertEmailFallback\(event\.params\.notificationId, data, recipientIds\)/);
  assert.match(delivery, /data\.deliverySource !== "server:staffEventAlerts"/);
  assert.match(delivery, /registeredAtMs < Date\.now\(\) - CURRENT_PUSH_TOKEN_MAX_AGE_MS/);
});

test('web push shows once with the app closed, and the open app keeps the registration fresh', () => {
  const worker = read('public/firebase-messaging-sw.js');
  assert.match(worker, /if \(payload\.notification && \(payload\.notification\.title \|\| payload\.notification\.body\)\) return;/);
  const shell = read('src/components/AuthenticatedShell.tsx');
  assert.match(shell, /PUSH_REFRESH_INTERVAL_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(shell, /visibilitychange/);
  assert.match(shell, /Notification\.permission !== 'granted'/);
  const inbox = read('src/pages/NotificationInboxPage.tsx');
  assert.match(inbox, /isRTL && notif\.titleAr \? notif\.titleAr : notif\.title/);
});
