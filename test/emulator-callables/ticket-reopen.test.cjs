'use strict';
// Limited ticket reopen: own ticket, reason required, capped, audited.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { reopenMaintenanceTicket } = lib('runtimeAll.js');
let tenant, other, adminUser, tech;
test.before(async () => {
  tenant = await createUser('tro_tenant', { role: 'tenant' });
  other = await createUser('tro_other', { role: 'tenant' });
  adminUser = await createUser('tro_admin', { role: 'admin' });
  tech = await createUser('tro_tech', { role: 'technician' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('maintenanceTickets/t_tro').set({ tenantId: 'tro_tenant', status: 'COMPLETED' });
});
const reason = 'Leak is still dripping under the sink';

test('tenant reopens own finished job; count, event and audit are written', async () => {
  const r = await call(reopenMaintenanceTicket, tenant, { ticketId: 't_tro', reason });
  assert.equal(r.reopenCount, 1);
  const t = (await db.doc('maintenanceTickets/t_tro').get()).data();
  assert.equal(t.status, 'REOPENED');
  assert.equal(t.reopenCount, 1);
  assert.equal(t.previousStatus, 'COMPLETED');
  const ev = (await db.doc('ticket_reopen_events/t_tro_1').get()).data();
  assert.equal(ev.actorRole, 'tenant');
  assert.equal((await db.collection('audit_logs').where('action', '==', 'TICKET_REOPENED').get()).size, 1);
});

test('tenant cap is 2; admin may do one more, then everyone is refused', async () => {
  await db.doc('maintenanceTickets/t_tro').set({ tenantId: 'tro_tenant', status: 'COMPLETED', reopenCount: 2 });
  await expectHttpsError(call(reopenMaintenanceTicket, tenant, { ticketId: 't_tro', reason }), 'resource-exhausted');
  const r = await call(reopenMaintenanceTicket, adminUser, { ticketId: 't_tro', reason });
  assert.equal(r.reopenCount, 3);
  await db.doc('maintenanceTickets/t_tro').update({ status: 'COMPLETED' });
  await expectHttpsError(call(reopenMaintenanceTicket, adminUser, { ticketId: 't_tro', reason }), 'resource-exhausted');
});

test('other tenants, technicians, short reasons and open jobs are refused', async () => {
  await expectHttpsError(call(reopenMaintenanceTicket, other, { ticketId: 't_tro', reason }), 'permission-denied');
  await expectHttpsError(call(reopenMaintenanceTicket, tech, { ticketId: 't_tro', reason }), 'permission-denied');
  await expectHttpsError(call(reopenMaintenanceTicket, tenant, { ticketId: 't_tro', reason: 'bad' }), 'invalid-argument');
  await db.doc('maintenanceTickets/t_tro').update({ status: 'IN_PROGRESS' });
  await expectHttpsError(call(reopenMaintenanceTicket, tenant, { ticketId: 't_tro', reason }), 'failed-precondition');
  assert.equal((await db.doc('maintenanceTickets/t_tro').get()).data().reopenCount, undefined);
});
