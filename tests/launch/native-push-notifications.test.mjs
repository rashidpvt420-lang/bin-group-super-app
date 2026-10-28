// Native (Capacitor) push: behaviour of src/services/nativePushService.ts against a mocked plugin, plus wiring,
// Android config and server-side compatibility checks. Real-device behaviour is listed in docs/NATIVE_PUSH_SETUP.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const nodeRequire = createRequire(import.meta.url);
const ts = nodeRequire('typescript');
const SOURCE = ts.transpileModule(read('src/services/nativePushService.ts'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function makeEnv({ platform = 'android', permission = 'prompt', requestResult = 'granted', tokenValue = `fcm1:APA91b${'x'.repeat(120)}`, user = { uid: 'u1' } } = {}) {
  const calls = { callable: [], plugin: [], navigate: [], events: [], channels: [] };
  const listeners = {};
  const storage = new Map();
  let nextToken = tokenValue;
  let permissionState = permission;
  const plugin = {
    checkPermissions: async () => ({ receive: permissionState }),
    requestPermissions: async () => { calls.plugin.push('requestPermissions'); permissionState = requestResult; return { receive: requestResult }; },
    createChannel: async (c) => { calls.channels.push(c); },
    register: async () => { calls.plugin.push('register'); setTimeout(() => listeners.registration?.({ value: nextToken }), 0); },
    unregister: async () => { calls.plugin.push('unregister'); },
    removeAllDeliveredNotifications: async () => { calls.plugin.push('removeAllDelivered'); },
    addListener: async (name, cb) => { listeners[name] = cb; return { remove: async () => { delete listeners[name]; } }; },
  };
  const appListeners = {};
  const modules = {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => platform !== 'web', getPlatform: () => platform } },
    '@capacitor/push-notifications': { PushNotifications: plugin },
    '@capacitor/app': { App: { addListener: async (n, cb) => { appListeners[n] = cb; return { remove: async () => {} }; } } },
    '../lib/firebase': {
      auth: { currentUser: user, beforeAuthStateChanged: (cb) => { calls.beforeAuth = cb; } },
      functions: {},
      httpsCallable: (_f, name) => async (payload) => {
        calls.callable.push({ name, payload });
        if (name === 'registerPushToken') return { data: { enabled: true, registrationId: 'r1', registeredTokenCount: 1, prunedTokenCount: 0 } };
        return { data: { removed: true } };
      },
    },
  };
  const window = {
    setTimeout, clearTimeout,
    localStorage: { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, v), removeItem: (k) => storage.delete(k) },
    dispatchEvent: (e) => { calls.events.push(e); return true; },
  };
  const sandbox = {
    exports: {}, window, console: { warn() {}, log() {}, error() {} }, Promise, Object, String, Date, JSON, Error, Set, Map, Number,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout, clearTimeout,
    require: (name) => { if (!(name in modules)) throw new Error(`unexpected import ${name}`); return modules[name]; },
  };
  sandbox.module = { exports: sandbox.exports };
  runInNewContext(SOURCE, sandbox);
  return { api: sandbox.exports, calls, listeners, appListeners, storage, setToken: (v) => { nextToken = v; } };
}

test('pure helpers: internal paths only, string-only data, FCM-vs-APNs token detection', () => {
  const { api } = makeEnv();
  assert.equal(api.safeInternalPath('/tickets/42?tab=chat'), '/tickets/42?tab=chat');
  for (const bad of ['https://evil.example', '//evil.example', 'javascript:alert(1)', 'tickets/1', '/a\\b', '/a\nb', '', null, undefined, `/${'a'.repeat(400)}`]) {
    assert.equal(api.safeInternalPath(bad), null, String(bad));
  }
  assert.deepEqual({ ...api.flattenPushData({ link: '/x', n: 5, z: null, o: undefined }) }, { link: '/x', n: '5' });
  assert.deepEqual({ ...api.flattenPushData('nope') }, {});
  assert.equal(api.looksLikeFcmToken(`abc:${'d'.repeat(80)}`), true);
  assert.equal(api.looksLikeFcmToken('a'.repeat(64)), false, 'a bare hex APNs token is not an FCM token');
  assert.equal(api.NATIVE_PUSH_CHANNEL_ID, 'bin_default');
});

test('android: prompts for permission, creates the channel, registers the token with platform android-native', async () => {
  const env = makeEnv();
  const result = await env.api.registerNativePushNotifications();
  assert.equal(result.enabled, true);
  assert.equal(result.platform, 'android-native');
  assert.deepEqual([...env.calls.plugin].slice(0, 2), ['requestPermissions', 'register']);
  assert.equal(env.calls.channels[0].id, 'bin_default');
  const reg = env.calls.callable.find((c) => c.name === 'registerPushToken');
  assert.equal(reg.payload.platform, 'android-native');
  assert.equal(reg.payload.permission, 'granted');
  assert.ok(reg.payload.token.length >= 50);
  assert.ok(env.storage.has('bin.nativePush.registration'));
});

test('permission denied: no token is requested or sent', async () => {
  const env = makeEnv({ requestResult: 'denied' });
  const result = await env.api.registerNativePushNotifications();
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'permission_denied');
  assert.equal(env.calls.callable.length, 0);
  assert.ok(!env.calls.plugin.includes('register'));
});

test('silent refresh never shows the OS prompt', async () => {
  const env = makeEnv();
  const result = await env.api.registerNativePushNotifications(false);
  assert.equal(result.enabled, false);
  assert.ok(!env.calls.plugin.includes('requestPermissions'));
});

test('ios without Firebase Messaging returns an explicit ios_fcm_not_configured instead of sending an APNs token', async () => {
  const env = makeEnv({ platform: 'ios', tokenValue: 'a'.repeat(64) });
  const result = await env.api.registerNativePushNotifications();
  assert.equal(result.enabled, false);
  assert.equal(result.reason, 'ios_fcm_not_configured');
  assert.equal(env.calls.callable.length, 0);
});

test('ios with an FCM token registers as ios-native', async () => {
  const env = makeEnv({ platform: 'ios' });
  const result = await env.api.registerNativePushNotifications();
  assert.equal(result.enabled, true);
  assert.equal(env.calls.callable.find((c) => c.name === 'registerPushToken').payload.platform, 'ios-native');
});

test('web / signed-out: native registration is a no-op', async () => {
  assert.equal((await makeEnv({ platform: 'web' }).api.registerNativePushNotifications()).reason, 'not_native_app');
  assert.equal((await makeEnv({ user: null }).api.registerNativePushNotifications()).reason, 'unauthenticated');
});

test('token refresh: a rotated token is re-registered and the old one removed', async () => {
  const env = makeEnv();
  await env.api.registerNativePushNotifications();
  const first = env.calls.callable[0].payload.token;
  await env.api.attachNativePushListeners({});
  const rotated = `fcm2:APA91b${'y'.repeat(120)}`;
  env.listeners.registration({ value: rotated });
  await new Promise((r) => setTimeout(r, 10));
  const registers = env.calls.callable.filter((c) => c.name === 'registerPushToken');
  assert.equal(registers.at(-1).payload.token, rotated);
  const removed = env.calls.callable.find((c) => c.name === 'unregisterPushToken');
  assert.equal(removed.payload.token, first);
});

test('logout cleanup: removes the server registration, clears storage and unregisters the device token', async () => {
  const env = makeEnv();
  await env.api.registerNativePushNotifications();
  const result = await env.api.unregisterNativePushNotifications();
  assert.equal(result.removed, true);
  assert.equal(env.storage.has('bin.nativePush.registration'), false);
  assert.ok(env.calls.plugin.includes('unregister'));
  assert.ok(env.calls.plugin.includes('removeAllDelivered'));
});

test('beforeAuthStateChanged hook cleans up on sign-out but not on a same-user refresh', async () => {
  const env = makeEnv();
  await env.api.registerNativePushNotifications();
  env.api.installNativePushLogoutCleanup();
  assert.equal(typeof env.calls.beforeAuth, 'function');
  await env.calls.beforeAuth({ uid: 'u1' });
  assert.equal(env.calls.callable.filter((c) => c.name === 'unregisterPushToken').length, 0);
  await env.calls.beforeAuth(null);
  assert.equal(env.calls.callable.filter((c) => c.name === 'unregisterPushToken').length, 1);
});

test('taps route to internal screens only; foreground arrivals are surfaced', async () => {
  const env = makeEnv();
  const navigated = [];
  const foreground = [];
  await env.api.attachNativePushListeners({ onNavigate: (p) => navigated.push(p), onForeground: (p) => foreground.push(p) });
  env.listeners.pushNotificationActionPerformed({ notification: { data: { link: '/tickets/42' } } });
  env.listeners.pushNotificationActionPerformed({ notification: { data: { link: 'https://evil.example' } } });
  env.listeners.pushNotificationActionPerformed({ notification: { data: { click_action: '/notifications' } } });
  env.listeners.pushNotificationActionPerformed({ notification: {} });
  assert.deepEqual(navigated, ['/tickets/42', '/notifications']);
  env.listeners.pushNotificationReceived({ title: 'Dispatch', body: 'Technician assigned', data: { link: '/x' } });
  assert.equal(foreground[0].notification.title, 'Dispatch');
  assert.equal(env.calls.events[0].type, 'bin:push-foreground');
});

test('web path is unchanged and native is only reached under isNativeApp()', () => {
  const svc = read('src/services/pushNotificationService.ts');
  assert.match(svc, /ios_requires_installed_pwa/);
  assert.match(svc, /VAPID|vapidKey/i);
  assert.match(svc, /if \(isNativeApp\(\)\) \{[\s\S]{0,200}registerNativePushNotifications\(\)/);
  assert.match(svc, /if \(isNativeApp\(\)\) return unregisterNativePushNotifications\(\)/);
  assert.match(svc, /if \(isNativeApp\(\)\) \{\s*return attachNativePushListeners/);
  assert.match(read('src/components/AuthenticatedShell.tsx'), /onNavigate: \(path\) => navigateRef\.current\(path\)/);
});

test('android config: notification icon + channel meta-data, and no new/dangerous permissions', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  for (const key of ['default_notification_icon', 'default_notification_color', 'default_notification_channel_id']) {
    assert.match(manifest, new RegExp(`com\\.google\\.firebase\\.messaging\\.${key}`));
  }
  assert.match(manifest, /android\.permission\.POST_NOTIFICATIONS/);
  const perms = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]);
  const dangerous = /READ_SMS|SEND_SMS|RECEIVE_SMS|READ_CONTACTS|WRITE_CONTACTS|READ_CALL_LOG|RECORD_AUDIO|READ_PHONE|SYSTEM_ALERT_WINDOW|SCHEDULE_EXACT_ALARM|USE_FULL_SCREEN_INTENT|ACCESS_BACKGROUND_LOCATION|MANAGE_EXTERNAL_STORAGE/;
  assert.deepEqual(perms.filter((p) => dangerous.test(p)), []);
  const icon = read('android/app/src/main/res/drawable/ic_stat_bin.xml');
  assert.match(icon, /<vector/);
  assert.match(read('android/app/src/main/res/values/push_notifications.xml'), /default_notification_channel_id[^<]*>bin_default</);
  assert.ok(!/google-services\.json/.test(manifest));
});

test('server: channel id matches the client; native platforms accepted; native tokens keep a longer freshness window', () => {
  const delivery = read('functions/notificationDelivery.ts');
  assert.match(delivery, /channelId: "bin_default"/);
  assert.match(delivery, /android: \{\s*priority: "high"/);
  assert.match(delivery, /isNativePushPlatform\(/);
  assert.match(delivery, /CURRENT_PUSH_TOKEN_MAX_AGE_MS/);
  const policy = read('functions/pushRegistrationPolicy.ts');
  assert.match(policy, /"android-native"/);
  assert.match(policy, /"ios-native"/);
  assert.match(read('functions/technicianDispatchNotifications.ts'), /isNativePushPlatform\(/);
});

test('unrelated: web service never logs registration tokens and keeps App Check/auth untouched', () => {
  assert.doesNotMatch(read('src/services/nativePushService.ts'), /console\.(log|info|warn|error)\([^\n]*token/i);
});
