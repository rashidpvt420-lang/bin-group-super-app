import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('push token registration is App Check-protected and server-authoritative', async () => {
  const backend = await read('functions/notificationDelivery.ts');
  expectAll(backend, [
    /export const registerPushToken = onCall/,
    /export const unregisterPushToken = onCall/,
    /enforceAppCheck: true/g,
    /admin\.auth\(\)\.getUser\(uid\)/,
    /db\.collection\("users"\)\.doc\(uid\)\.get\(\)/,
    /authRecord\.emailVerified/,
    /profileIsActive\(profile\)/,
    /resolvedRole\(authRecord, profile\)/,
    /crypto\.createHash\("sha256"\)\.update\(token/,
    /collection\("fcmTokens"\)\.doc\(hash\)/,
    /MAX_PUSH_TOKENS_PER_USER = 10/,
    /fcmTokens: FieldValue\.delete\(\)/,
    /PUSH_TOKEN_REGISTERED/,
    /PUSH_TOKEN_UNREGISTERED/,
    /sensitiveValuesExcluded: true/,
  ], 'push token callable authority');
  assert.doesNotMatch(backend, /request\.data\?\.(?:userId|uid|role|userRole)/);
  assert.doesNotMatch(backend, /collection\("users"\)\.doc\(userId\)\.get\([^)]*fcmTokens/);
});

test('push delivery reads only hashed token documents and prunes invalid registrations server-side', async () => {
  const backend = await read('functions/notificationDelivery.ts');
  expectAll(backend, [
    /tokenHash\(token\) !== tokenDoc\.id/,
    /registrationsForUser/,
    /batch\.delete\(registration\.ref\)/,
    /refreshUserPushSummary\(userId\)/,
    /pushPrunedCount: invalidRegistrations\.length/,
    /pushDeliveryState: deliveryState/,
    /pushDeliveryState: "NO_REGISTERED_TOKEN"/,
    /invalidPushTokens: FieldValue\.delete\(\)/,
  ], 'push delivery pruning');
  assert.doesNotMatch(backend, /data\.token \|\| tokenDoc\.id/);
  assert.doesNotMatch(backend, /invalidPushTokens:\s*invalidTokens/);
  assert.doesNotMatch(backend, /userSnap\.data\(\)\?\.fcmTokens/);
});

test('all browser push registration paths use callables and never write or expose raw tokens', async () => {
  const [service, hook, manager, ownerManager, ownerContext, sharedContext] = await Promise.all([
    read('src/services/pushNotificationService.ts'),
    read('src/hooks/useNotifications.ts'),
    read('src/components/NotificationManager.tsx'),
    read('apps/owner-app/src/components/NotificationManager.tsx'),
    read('apps/owner-app/src/context/RoleContext.tsx'),
    read('packages/shared/src/context/AuthProvider.tsx'),
  ]);
  expectAll(service, [
    /httpsCallable\(functions, 'registerPushToken'\)/,
    /httpsCallable\(functions, 'unregisterPushToken'\)/,
    /registrationId/,
    /registeredTokenCount/,
    /VITE_FIREBASE_VAPID_KEY/,
  ], 'browser push service');
  assert.doesNotMatch(service, /from 'firebase\/firestore'/);
  assert.doesNotMatch(service, /setDoc\(|updateDoc\(|arrayUnion\(|collection\(/);
  assert.doesNotMatch(service, /return \{[^}]*token[,}]/s);
  assert.doesNotMatch(service, /console\.(?:log|info|warn|error)\([^\n]*token/i);

  assert.doesNotMatch(hook, /FCM Token|fcmToken|tokenCache/);
  assert.match(hook, /registrationAvailable/);

  for (const [label, source] of [
    ['main manager', manager],
    ['owner manager', ownerManager],
    ['owner role context', ownerContext],
    ['shared auth context', sharedContext],
  ]) {
    assert.doesNotMatch(source, /BAx9XuLUWYy4cmogu_/);
    assert.doesNotMatch(source, /arrayUnion\(|fcmTokens:/);
    assert.match(source, /registerPushToken|registerPushNotifications/, `${label} must use server registration`);
    assert.match(source, /VITE_FIREBASE_VAPID_KEY|registerPushNotifications/, `${label} must use environment-backed service`);
  }
});

test('rules pipeline makes user push documents and root summaries Admin-SDK-only', async () => {
  const [hardener, pipeline, ruleTests, runtime] = await Promise.all([
    read('scripts/harden-push-token-authority.mjs'),
    read('scripts/apply-profile-admin-rule.mjs'),
    read('test/push-token-security-rules.test.js'),
    read('functions/runtime.ts'),
  ]);
  expectAll(hardener, [
    /match \/fcmTokens\/\{tokenId\}/,
    /match \/deviceReadiness\/\{readinessId\}/,
    /allow read, write: if false;/,
    /SERVER_MANAGED_PROFILE_FIELDS/,
    /'fcmTokens'/,
    /'pushEnabled'/,
    /'pushTokenCount'/,
    /safeUserBootstrapCreate/,
    /safeUserSelfUpdate/,
  ], 'push rules hardener');
  assert.match(pipeline, /harden-push-token-authority\.mjs/);
  expectAll(ruleTests, [
    /cannot read or mutate server-managed push token documents/,
    /cannot write raw push tokens, push authority summaries or readiness/,
    /technician operational readiness remains available/,
  ], 'push emulator coverage');
  assert.match(runtime, /export \* from "\.\/notificationDelivery";/);
});

test('legacy notification helper exposes only boolean registration state', async () => {
  const source = await read('src/lib/notificationService.ts');
  assert.match(source, /registrationTokenAvailable/);
  assert.match(source, /hasRegistrationToken\(\): Promise<boolean>/);
  assert.doesNotMatch(source, /getFCMToken/);
  assert.doesNotMatch(source, /tokenCache/);
  assert.doesNotMatch(source, /console\.log\([^\n]*FCM.*token/i);
});
