'use strict';
// PR C: public read-only app assistant + confirm-before-act dashboard AI.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { askPublicAppAssistant, proposeDashboardAiAction, confirmDashboardAiAction } = lib('runtimeAll.js');
const pub = lib('publicAppAssistant.js');
const dash = lib('dashboardAiActions.js');

let owner, tenant, otherOwner, admin;
test.before(async () => {
  owner = await createUser('prc_owner', { role: 'owner' });
  tenant = await createUser('prc_tenant', { role: 'tenant' });
  otherOwner = await createUser('prc_owner2', { role: 'owner' });
  admin = await createUser('prc_admin', { role: 'super_admin', admin: true });
});
test.beforeEach(clearFirestore);

test('public assistant answers logged-out visitors from approved facts only, without reading customer data', async () => {
  await db.doc('active_contracts/secret').set({ ownerName: 'Private Person', amount: 95306 });
  const res = await call(askPublicAppAssistant, null, { text: 'How do payments work?' });
  assert.equal(res.publicOnly, true);
  assert.equal(res.readOnly, true);
  assert.match(res.text, /cash or cheque/i);
  assert.doesNotMatch(res.text, /Private Person|95306/);
});

test('public assistant is rate limited per client', async () => {
  for (let i = 0; i < pub.PUBLIC_AI_LIMIT; i += 1) await call(askPublicAppAssistant, null, { text: 'what is bin group' });
  await expectHttpsError(call(askPublicAppAssistant, null, { text: 'what is bin group' }), 'resource-exhausted');
});

test('public facts contain no customer-style data', () => {
  const all = JSON.stringify(pub.PUBLIC_APP_FACTS);
  assert.doesNotMatch(all, /@|\+971|AED\s?\d/);
});

test('dashboard AI refuses payments and approvals for every role', async () => {
  for (const text of ['approve my payment', 'mark the cheque as paid', 'refund invoice 12', 'dispatch a technician']) {
    const res = await call(proposeDashboardAiAction, owner, { text });
    assert.equal(res.proposal, null);
    assert.equal(res.refused, true);
  }
  assert.equal(dash.classifyDashboardIntent('approve all payments').kind, 'forbidden');
});

test('dashboard AI requires sign-in and an allowed role', async () => {
  await expectHttpsError(call(proposeDashboardAiAction, null, { text: 'mark notifications read' }), 'unauthenticated');
  await expectHttpsError(call(proposeDashboardAiAction, admin, { text: 'mark notifications read' }), 'permission-denied');
});

test('dashboard AI only acts after confirm, and only on the caller\'s own records', async () => {
  await db.doc('notifications/n_owner').set({ recipientId: owner.uid, read: false });
  await db.doc('notifications/n_other').set({ recipientId: otherOwner.uid, read: false });
  const { proposal } = await call(proposeDashboardAiAction, owner, { text: 'please mark my notifications as read' });
  assert.ok(proposal?.id);
  assert.equal((await db.doc('notifications/n_owner').get()).data().read, false, 'nothing happens before confirm');
  await expectHttpsError(call(confirmDashboardAiAction, otherOwner, { proposalId: proposal.id }), 'not-found');
  await expectHttpsError(call(confirmDashboardAiAction, tenant, { proposalId: proposal.id }), 'not-found');
  const done = await call(confirmDashboardAiAction, owner, { proposalId: proposal.id });
  assert.equal(done.status, 'executed');
  assert.equal((await db.doc('notifications/n_owner').get()).data().read, true);
  assert.equal((await db.doc('notifications/n_other').get()).data().read, false);
  await expectHttpsError(call(confirmDashboardAiAction, owner, { proposalId: proposal.id }), 'failed-precondition');
  const audit = await db.collection('ai_action_audit').where('proposalId', '==', proposal.id).get();
  assert.equal(audit.size, 1);
});

test('cancelled proposals never execute', async () => {
  await db.doc('notifications/n1').set({ recipientId: owner.uid, read: false });
  const { proposal } = await call(proposeDashboardAiAction, owner, { text: 'clear notifications' });
  assert.equal((await call(confirmDashboardAiAction, owner, { proposalId: proposal.id, decision: 'cancel' })).status, 'cancelled');
  await expectHttpsError(call(confirmDashboardAiAction, owner, { proposalId: proposal.id }), 'failed-precondition');
  assert.equal((await db.doc('notifications/n1').get()).data().read, false);
});
