'use strict';
// N-21 regression: tenant invitation open-tracking must not put the raw invitation token
// (the secret that accepts the invite) into the tracking pixel URL / request logs.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const fns = lib('index.js');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function trackOpen(query) {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, send() { this.sent = true; return this; } };
  await fns.trackTenantInvitationOpen({ query, method: 'GET', headers: {}, get: () => undefined }, res);
  return res;
}

async function sendOneInvite() {
  await clearFirestore();
  const adminActor = await createUser(
    'n21-admin',
    { role: 'admin', admin: true },
    { tokenExtra: { firebase: { sign_in_second_factor: 'phone' } } },
  );
  await db.collection('tenant_invitations').doc('inv-1').set({
    status: 'pending', tenantName: 'Tenant One', tenantEmail: 'tenant1@example.invalid',
    propertyId: 'prop-1', propertyName: 'Tower', unitNumber: '101', importBatchId: 'batch-1',
  });
  const result = await call(fns.sendTenantInvitations, adminActor, { importBatchId: 'batch-1' });
  assert.equal(result.sentCount, 1);
  const invite = (await db.collection('tenant_invitations').doc('inv-1').get()).data();
  const mail = (await db.collection('mail').doc(invite.mailDocumentId).get()).data();
  const rawToken = /tenant-invite\?token=([a-f0-9]{64})/.exec(mail.message.html)[1];
  const pixel = /<img src='([^']+)'/.exec(mail.message.html)[1];
  return { invite, mail, rawToken, pixel };
}

test('tracking pixel URL carries an opaque id, never the raw invitation token or its hash', async () => {
  const { invite, mail, rawToken, pixel } = await sendOneInvite();
  assert.equal(sha256(rawToken), invite.inviteTokenHash, 'invite link token is the accept secret');
  assert.ok(!pixel.includes(rawToken), 'pixel must not contain the raw token');
  assert.ok(!pixel.includes(invite.inviteTokenHash), 'pixel must not contain the token hash either');
  assert.ok(!/[?&]token=/.test(pixel), 'pixel must not use the token parameter');
  const tid = new URL(pixel).searchParams.get('tid');
  assert.match(tid, /^[a-f0-9]{32}$/);
  assert.equal(invite.openTrackingId, tid);
  assert.notEqual(sha256(tid), invite.inviteTokenHash);
  // The raw token appears in the email only as the accept link, not as a tracking URL.
  assert.equal(mail.message.html.split(rawToken).length - 1, 1);
});

test('opening via the opaque id marks the invitation opened', async () => {
  const { pixel } = await sendOneInvite();
  const res = await trackOpen({ tid: new URL(pixel).searchParams.get('tid') });
  assert.equal(res.statusCode, 204);
  const invite = (await db.collection('tenant_invitations').doc('inv-1').get()).data();
  assert.equal(invite.status, 'opened');
  const events = await db.collection('tenant_invitation_events').where('type', '==', 'OPENED').get();
  assert.equal(events.size, 1);
});

test('the tracking endpoint no longer accepts the raw token, and rejects malformed ids', async () => {
  const { rawToken } = await sendOneInvite();
  for (const query of [{ token: rawToken }, { tid: rawToken }, { tid: "x' OR 1" }, { tid: ['a'] }, {}]) {
    const res = await trackOpen(query);
    assert.equal(res.statusCode, 204);
  }
  const invite = (await db.collection('tenant_invitations').doc('inv-1').get()).data();
  assert.equal(invite.status, 'sent');
});
