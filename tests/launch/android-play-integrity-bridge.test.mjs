import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gradle = readFileSync('android/app/build.gradle', 'utf8');
const mainActivity = readFileSync('android/app/src/main/java/ae/bingroups/superapp/MainActivity.java', 'utf8');
const bridge = readFileSync('android/app/src/main/java/ae/bingroups/superapp/FirebaseAppCheckBridgePlugin.java', 'utf8');
const firebase = readFileSync('src/lib/firebase.ts', 'utf8');

test('Android release uses Play Integrity-backed Firebase App Check', () => {
  assert.match(gradle, /firebase-bom:/);
  assert.match(gradle, /firebase-appcheck-playintegrity/);
  assert.match(mainActivity, /PlayIntegrityAppCheckProviderFactory\.getInstance\(\)/);
  assert.match(mainActivity, /registerPlugin\(FirebaseAppCheckBridgePlugin\.class\)/);

  const registerIndex = mainActivity.indexOf('registerPlugin(FirebaseAppCheckBridgePlugin.class)');
  const superOnCreateIndex = mainActivity.indexOf('super.onCreate(savedInstanceState)');
  assert.ok(registerIndex >= 0, 'custom App Check bridge must be registered');
  assert.ok(superOnCreateIndex >= 0, 'BridgeActivity onCreate must still run');
  assert.ok(
    registerIndex < superOnCreateIndex,
    'custom App Check bridge must be registered before BridgeActivity creates the Capacitor bridge',
  );
});

test('native bridge returns App Check token metadata without debug fallback', () => {
  assert.match(bridge, /@CapacitorPlugin\(name = "FirebaseAppCheckBridge"\)/);
  assert.match(bridge, /@PluginMethod/);
  assert.match(bridge, /getAppCheckToken\(forceRefresh\)/);
  assert.match(bridge, /getExpireTimeMillis\(\)/);
  assert.doesNotMatch(bridge, /DebugAppCheckProviderFactory|debug token|FIREBASE_APPCHECK_DEBUG_TOKEN/i);
  assert.doesNotMatch(bridge, /Log\.[a-z]+\([^\n]*token/i);
});

test('Firebase JS keeps web reCAPTCHA and registers the native Capacitor App Check proxy', () => {
  assert.match(firebase, /import \{ registerPlugin \} from '@capacitor\/core'/);
  assert.match(firebase, /registerPlugin<NativeAppCheckBridge>\('FirebaseAppCheckBridge'\)/);
  assert.match(firebase, /const bridge = nativeAppCheckBridge/);
  assert.match(firebase, /CustomProvider/);
  assert.match(firebase, /isCapacitorAndroid/);
  assert.match(firebase, /ReCaptchaEnterpriseProvider/);
  assert.match(firebase, /ReCaptchaV3Provider/);
  assert.match(firebase, /isTokenAutoRefreshEnabled:\s*true/);
  assert.match(firebase, /!isCapacitorNative[\s\S]*localhost/);
});
