'use strict';
// Native (Capacitor) push: registerPushToken must accept the native platforms, keep rejecting unknown ones,
// store the same token shape deliverNotificationPush reads, and unregisterPushToken must remove it.
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const policy = lib('pushRegistrationPolicy.js');
const fcmLike = (seed) => `${seed}:APA91b${'x'.repeat(120)}`;
let tenant;
test.before(async () => {
  tenant = await createUser('prb_push_tenant', { role: 'tenant' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/prb_push_tenant').set({ role: 'tenant', status: 'active' });
});
const tokenDoc = async (token) => db.doc(`users/prb_push_tenant/fcmTokens/${crypto.createHash('sha256').update(token, 'utf8').digest('hex')}`).get();

for (const platform of ['android-native', 'ios-native', 'web', 'android-web', 'ios-pwa']) {
  test(`registerPushToken accepts platform ${platform} and stores the delivery token shape`, async () => {
    const token = fcmLike(`tok_${platform}`);
    const result = await call(runtime.registerPushToken, tenant, { token, platform, permission: 'granted', isStandalone: false });
    assert.equal(result.enabled, true);
    assert.equal(result.platform, platform);
    const snap = await tokenDoc(token);
    assert.equal(snap.exists, true);
    const data = snap.data();
    assert.equal(data.token, token);
    assert.equal(data.platform, platform);
    assert.equal(data.permission, 'granted');
    assert.equal(data.active, true);
    assert.equal(data.userId, 'prb_push_tenant');
    assert.ok(data.lastRegisteredAt, 'lastRegisteredAt drives delivery freshness');
  });
}

test('registerPushToken still rejects unknown platforms and missing permission', async () => {
  await expectHttpsError(call(runtime.registerPushToken, tenant, { token: fcmLike('bad'), platform: 'windows-native', permission: 'granted' }), 'invalid-argument');
  await expectHttpsError(call(runtime.registerPushToken, tenant, { token: fcmLike('noperm'), platform: 'android-native', permission: 'denied' }), 'failed-precondition');
  await expectHttpsError(call(runtime.registerPushToken, null, { token: fcmLike('anon'), platform: 'android-native', permission: 'granted' }), 'unauthenticated');
});

test('unregisterPushToken removes a native registration (logout cleanup)', async () => {
  const token = fcmLike('logout');
  await call(runtime.registerPushToken, tenant, { token, platform: 'android-native', permission: 'granted' });
  const result = await call(runtime.unregisterPushToken, tenant, { token });
  assert.equal(result.removed, true);
  assert.equal((await tokenDoc(token)).exists, false);
});

test('native registrations stay deliverable for 7 days; web registrations keep the 24 hour window', () => {
  assert.equal(policy.isNativePushPlatform('android-native'), true);
  assert.equal(policy.isNativePushPlatform('ios-native'), true);
  for (const web of ['web', 'android-web', 'ios-pwa', '', undefined]) assert.equal(policy.isNativePushPlatform(web), false);
  assert.equal(policy.NATIVE_REGISTRATION_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
});
