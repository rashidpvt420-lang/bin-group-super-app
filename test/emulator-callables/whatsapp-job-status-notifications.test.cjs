'use strict';
// WhatsApp job status updates: opt-in only, approved templates only, idempotent per event, audited. Mock sender only — never real sends.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
const wa = lib('whatsappJobStatusNotifications.js');
let tenant, owner, tech;
test.before(async () => {
  tenant = await createUser('wa_tenant', { role: 'tenant' });
  owner = await createUser('wa_owner', { role: 'owner' });
  tech = await createUser('wa_tech', { role: 'technician' });
});
test.beforeEach(clearFirestore);

function mockSender() {
  const sent = [];
  const fn = async (m) => { sent.push(m); return { ok: true, status: 200 }; };
  fn.sent = sent;
  return fn;
}

test('event derivation and recipients', () => {
  assert.deepEqual(wa.ticketEvents(undefined, { status: 'OPEN' }), ['SUBMITTED']);
  assert.deepEqual(wa.ticketEvents({ status: 'OPEN' }, { status: 'OPEN', assignedTechnicianId: 't' }), ['ASSIGNED']);
  assert.deepEqual(wa.ticketEvents({ status: 'EN_ROUTE', assignedTechnicianId: 't' }, { status: 'ARRIVED', assignedTechnicianId: 't' }), ['ARRIVAL']);
  assert.deepEqual(wa.ticketEvents({ status: 'ARRIVED' }, { status: 'completed' }), ['COMPLETED']);
  assert.deepEqual(wa.ticketEvents({ status: 'ARRIVED' }, { status: 'ARRIVED', note: 'x' }), []);
  assert.deepEqual(wa.recipientsFor('APPROVAL_NEEDED', { tenantId: 'a', ownerId: 'b' }), ['b']);
  assert.deepEqual(wa.recipientsFor('COMPLETED', { tenantId: 'a', ownerId: 'b' }), ['a', 'b']);
});

test('opt-in via own profile phone; technicians cannot opt in', async () => {
  await expectHttpsError(call(rt.setWhatsAppJobUpdatesOptIn, tenant, { optIn: true }), 'failed-precondition');
  await db.doc('users/wa_tenant').set({ phoneNumber: '+971501234567' }, { merge: true });
  await call(rt.setWhatsAppJobUpdatesOptIn, tenant, { optIn: true, language: 'ar' });
  const o = (await db.doc('whatsapp_optins/wa_tenant').get()).data();
  assert.equal(o.optIn, true); assert.equal(o.phoneE164, '+971501234567'); assert.equal(o.language, 'ar');
  await expectHttpsError(call(rt.setWhatsAppJobUpdatesOptIn, tech, { optIn: true }), 'permission-denied');
});

test('sends only to opted-in users with approved template, once per event, audited', async () => {
  await db.doc('whatsapp_optins/wa_tenant').set({ userId: 'wa_tenant', optIn: true, phoneE164: '+971501234567', language: 'en' });
  const send = mockSender();
  const ticket = { tenantId: 'wa_tenant', ownerId: 'wa_owner', category: 'AC' };
  let out = await wa.notifyJobEvent('ticket123456', 'COMPLETED', ticket, send);
  assert.deepEqual(out.map((o) => o.result).sort(), ['SKIPPED_NOT_OPTED_IN', 'SKIPPED_TEMPLATE_NOT_APPROVED']);
  assert.equal(send.sent.length, 0);
  await db.doc('whatsapp_templates/ARRIVAL').set({ approved: true, templateName: 'bin_job_arrival' });
  out = await wa.notifyJobEvent('ticket123456', 'ARRIVAL', ticket, send);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'SENT');
  out = await wa.notifyJobEvent('ticket123456', 'ARRIVAL', ticket, send);
  assert.equal(out.find((o) => o.uid === 'wa_tenant').result, 'DUPLICATE');
  assert.equal(send.sent.length, 1);
  assert.deepEqual(send.sent[0], { to: '+971501234567', template: 'bin_job_arrival', language: 'en', params: ['TICKET12', 'AC'] });
  const audits = await db.collection('audit_logs').where('action', '==', 'WHATSAPP_JOB_STATUS_NOTIFICATION').get();
  assert.equal(audits.size, 2);
});

test('emulator never calls the real Graph API', async () => {
  const prev = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = 'true';
  const r = await wa.graphSender({ to: '+971500000000', template: 'x', language: 'en', params: [] });
  process.env.FUNCTIONS_EMULATOR = prev;
  assert.deepEqual(r, { ok: false, status: 0 });
});
