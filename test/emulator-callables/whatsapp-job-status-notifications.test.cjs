'use strict';
// WhatsApp job status updates: opt-in only, approved templates only, idempotent per event, audited. Mock sender only — never real sends.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
const wa = lib('whatsappJobStatusNotifications.js');
const policy = lib('whatsappPolicy.js');
let tenant, owner, tech, adminMfa, financeMfa;
test.before(async () => {
  tenant = await createUser('wa_tenant', { role: 'tenant' });
  owner = await createUser('wa_owner', { role: 'owner' });
  tech = await createUser('wa_tech', { role: 'technician' });
  adminMfa = await createUser('wa_admin', { role: 'admin', admin: true }, { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } });
  financeMfa = await createUser('wa_finance', { role: 'finance_admin' }, { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } });
});
test.beforeEach(clearFirestore);

function mockSender() {
  const sent = [];
  const fn = async (m) => { sent.push(m); return { ok: true, status: 200 }; };
  fn.sent = sent;
  return fn;
}

const daySend = new Date('2026-11-11T10:00:00Z'); // 14:00 Dubai, outside quiet hours
const nightSend = new Date('2026-11-11T19:30:00Z'); // 23:30 Dubai

test('event derivation and recipients', () => {
  assert.deepEqual(wa.ticketEvents(undefined, { status: 'OPEN' }), ['TICKET_SUBMITTED']);
  assert.deepEqual(wa.ticketEvents({ status: 'OPEN' }, { status: 'OPEN', assignedTechnicianId: 't' }), ['TECH_ASSIGNED']);
  assert.deepEqual(wa.ticketEvents({ status: 'EN_ROUTE', assignedTechnicianId: 't' }, { status: 'ARRIVED', assignedTechnicianId: 't' }), ['TECH_ARRIVED']);
  assert.deepEqual(wa.ticketEvents({ status: 'ARRIVED' }, { status: 'completed' }), ['JOB_COMPLETED']);
  assert.deepEqual(wa.ticketEvents({ status: 'ARRIVED' }, { status: 'ARRIVED', note: 'x' }), []);
  assert.deepEqual(wa.recipientsFor('OWNER_APPROVAL_NEEDED', { tenantId: 'a', ownerId: 'b' }), ['b']);
  assert.deepEqual(wa.recipientsFor('JOB_COMPLETED', { tenantId: 'a', ownerId: 'b' }), ['a', 'b']);
  assert.deepEqual(wa.recipientsFor('RENT_DUE_REMINDER', { tenantId: 'a', ownerId: 'b' }), ['a']);
});

test('opt-in via own profile phone; technicians cannot opt in; pre-opt-in reports coming soon', async () => {
  await expectHttpsError(call(rt.setWhatsAppJobUpdatesOptIn, tenant, { optIn: true }), 'failed-precondition');
  await db.doc('users/wa_tenant').set({ phoneNumber: '+971501234567' }, { merge: true });
  const result = await call(rt.setWhatsAppJobUpdatesOptIn, tenant, { optIn: true, language: 'ar' });
  const o = (await db.doc('whatsapp_optins/wa_tenant').get()).data();
  assert.equal(o.optIn, true); assert.equal(o.phoneE164, '+971501234567'); assert.equal(o.language, 'ar');
  assert.equal(result.comingSoon, true);
  const status = await call(rt.getWhatsAppJobUpdatesStatus, tenant, {});
  assert.equal(status.comingSoon, true);
  assert.equal(status.optIn, true);
  await expectHttpsError(call(rt.setWhatsAppJobUpdatesOptIn, tech, { optIn: true }), 'permission-denied');
});

test('sends only to opted-in users with approved template, once per event, audited, using en_US', async () => {
  await db.doc('whatsapp_optins/wa_tenant').set({ userId: 'wa_tenant', optIn: true, phoneE164: '+971501234567', language: 'en' });
  const send = mockSender();
  const ticket = { tenantId: 'wa_tenant', ownerId: 'wa_owner', category: 'AC' };
  let out = await wa.notifyJobEvent('ticket123456', 'JOB_COMPLETED', ticket, send, daySend);
  assert.deepEqual(out.map((o) => o.result).sort(), ['SKIPPED_NOT_OPTED_IN', 'SKIPPED_TEMPLATE_NOT_APPROVED']);
  assert.equal(send.sent.length, 0);
  await db.doc('whatsapp_templates/TECH_ARRIVED').set({ approved: true, templateName: 'bin_tech_arrived' });
  out = await wa.notifyJobEvent('ticket123456', 'TECH_ARRIVED', ticket, send, daySend);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'SENT');
  out = await wa.notifyJobEvent('ticket123456', 'TECH_ARRIVED', ticket, send, daySend);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'DUPLICATE');
  assert.equal(send.sent.length, 1);
  assert.deepEqual(send.sent[0], { to: '+971501234567', template: 'bin_tech_arrived', language: 'en_US', params: ['TICKET12', 'AC'] });
  const audits = await db.collection('audit_logs').where('action', '==', 'WHATSAPP_JOB_STATUS_NOTIFICATION').get();
  assert.equal(audits.size, 2);
});

test('locale override on the template is used when sending', async () => {
  await db.doc('whatsapp_optins/wa_tenant').set({ userId: 'wa_tenant', optIn: true, phoneE164: '+971501234567', language: 'en' });
  await db.doc('whatsapp_templates/TECH_ASSIGNED').set({ approved: true, templateName: 'bin_tech_assigned', languageCodes: { en: 'en_GB', ar: 'ar' } });
  const send = mockSender();
  const out = await wa.notifyJobEvent('ticket-locale', 'TECH_ASSIGNED', { tenantId: 'wa_tenant', category: 'Plumbing' }, send, daySend);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'SENT');
  assert.equal(send.sent[0].language, 'en_GB');
});

test('quiet hours skip non-emergency tickets and still send emergencies', async () => {
  await db.doc('whatsapp_optins/wa_tenant').set({ userId: 'wa_tenant', optIn: true, phoneE164: '+971501234567', language: 'en' });
  await db.doc('whatsapp_templates/TECH_ASSIGNED').set({ approved: true, templateName: 'bin_tech_assigned' });
  const send = mockSender();
  let out = await wa.notifyJobEvent('ticket-quiet', 'TECH_ASSIGNED', { tenantId: 'wa_tenant', category: 'AC', urgency: 'normal' }, send, nightSend);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'SKIPPED_QUIET_HOURS');
  assert.equal(send.sent.length, 0);
  out = await wa.notifyJobEvent('ticket-emergency', 'TECH_ASSIGNED', { tenantId: 'wa_tenant', category: 'AC', urgency: 'emergency' }, send, nightSend);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'SENT');
  assert.equal(send.sent.length, 1);
});

test('outbound rate limit is per user per Dubai day', async () => {
  await db.doc('whatsapp_optins/wa_tenant').set({ userId: 'wa_tenant', optIn: true, phoneE164: '+971501234567', language: 'en' });
  await db.doc('whatsapp_templates/TICKET_SUBMITTED').set({ approved: true, templateName: 'bin_ticket_submitted' });
  const send = mockSender();
  for (let i = 0; i < policy.OUTBOUND_DAILY_LIMIT; i += 1) {
    const out = await wa.notifyJobEvent(`ticket-rate-${i}`, 'TICKET_SUBMITTED', { tenantId: 'wa_tenant', category: 'AC' }, send, daySend);
    assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'SENT', `send ${i} should succeed`);
  }
  const blocked = await wa.notifyJobEvent('ticket-rate-over', 'TICKET_SUBMITTED', { tenantId: 'wa_tenant', category: 'AC' }, send, daySend);
  assert.equal(blocked.find((o) => o.uid === 'wa_tenant').result, 'SKIPPED_RATE_LIMITED');
  assert.equal(send.sent.length, policy.OUTBOUND_DAILY_LIMIT);
});

test('adminUpsertWhatsAppTemplate requires Admin or CEO with MFA and writes an audit log', async () => {
  await expectHttpsError(call(rt.adminUpsertWhatsAppTemplate, tenant, { event: 'TECH_ARRIVED', templateName: 'bin_tech_arrived', approved: true }), 'permission-denied');
  await expectHttpsError(call(rt.adminUpsertWhatsAppTemplate, financeMfa, { event: 'TECH_ARRIVED', templateName: 'bin_tech_arrived', approved: true }), 'permission-denied');
  const saved = await call(rt.adminUpsertWhatsAppTemplate, adminMfa, { event: 'TECH_ARRIVED', templateName: 'bin_tech_arrived', approved: true, languageCodes: { ar: 'ar', en: 'en_US' } });
  assert.equal(saved.status, 'SUCCESS');
  const doc = (await db.doc('whatsapp_templates/TECH_ARRIVED').get()).data();
  assert.equal(doc.templateName, 'bin_tech_arrived');
  assert.equal(doc.approved, true);
  assert.equal(doc.languageCodes.en, 'en_US');
  const audits = await db.collection('audit_logs').where('action', '==', 'WHATSAPP_TEMPLATE_UPSERT').get();
  assert.equal(audits.size, 1);
  assert.equal(audits.docs[0].data().templateName, 'bin_tech_arrived');
});

test('rent reminder notifications include recipientId so push can send', async () => {
  const rent = lib('rentSchedule.js');
  await db.doc('rent_installments/leaseA_01_2026-11-18').set({
    leaseKey: 'leaseA', tenantUid: 'wa_tenant', tenantEmail: 'tenant@example.invalid',
    dueDate: '2026-11-18', amount: 5000, status: 'DUE', remindersSent: {},
  });
  // 2026-11-11 is 7 days before 2026-11-18.
  const result = await rent.runRentReminders(new Date('2026-11-11T05:00:00Z'));
  assert.equal(result.sent, 1);
  const snap = await db.doc('notifications/RENT_DUE_REMINDER_leaseA_01_2026-11-18_7d').get();
  assert.equal(snap.exists, true);
  assert.equal(snap.data().recipientId, 'wa_tenant');
  assert.equal(snap.data().userId, 'wa_tenant');
  const mail = await db.doc('mail/RENT_DUE_REMINDER_leaseA_01_2026-11-18_7d').get();
  assert.equal(mail.exists, true);
});

test('emulator never calls the real Graph API', async () => {
  const prev = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = 'true';
  const r = await wa.graphSender({ to: '+971500000000', template: 'x', language: 'en_US', params: [] });
  process.env.FUNCTIONS_EMULATOR = prev;
  assert.deepEqual(r, { ok: false, status: 0 });
});
