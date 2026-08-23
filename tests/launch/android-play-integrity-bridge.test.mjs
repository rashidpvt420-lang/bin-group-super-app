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
});

test('native bridge returns App Check token metadata without debug fallback', () => {
  assert.match(bridge, /@CapacitorPlugin\(name = "FirebaseAppCheckBridge"\)/);
  assert.match(bridge, /@PluginMethod/);
  assert.match(bridge, /getAppCheckToken\(forceRefresh\)/);
  assert.match(bridge, /getExpireTimeMillis\(\)/);
  assert.doesNotMatch(bridge, /DebugAppCheckProviderFactory|debug token|FIREBASE_APPCHECK_DEBUG_TOKEN/i);
  assert.doesNotMatch(bridge, /Log\.[a-z]+\([^\n]*token/i);
});

test('Firebase JS keeps web reCAPTCHA and uses native CustomProvider on Capacitor Android', () => {
  assert.match(firebase, /CustomProvider/);
  assert.match(firebase, /isCapacitorAndroid/);
  assert.match(firebase, /FirebaseAppCheckBridge/);
  assert.match(firebase, /ReCaptchaEnterpriseProvider/);
  assert.match(firebase, /ReCaptchaV3Provider/);
  assert.match(firebase, /isTokenAutoRefreshEnabled:\s*true/);
  assert.match(firebase, /!isCapacitorNative[\s\S]*localhost/);
});
