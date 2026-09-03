import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [injectScript, androidWorkflow] = await Promise.all([
  readFile(new URL('../../scripts/inject-android-google-services.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/android-store-release.yml', import.meta.url), 'utf8'),
]);

test('Android release selects the Firebase Android client for the Capacitor WebView bundle', () => {
  assert.match(injectScript, /EXPECTED_PACKAGE = 'ae\.bingroups\.superapp'/);
  assert.match(injectScript, /android_client_info\?\.package_name/);
  assert.match(injectScript, /client_info\?\.mobilesdk_app_id/);
  assert.match(injectScript, /api_key\?\.\[0\]\?\.current_key/);
  assert.match(injectScript, /VITE_FIREBASE_API_KEY=\$\{androidApiKey\}/);
  assert.match(injectScript, /VITE_FIREBASE_APP_ID=\$\{androidAppId\}/);
  assert.match(injectScript, /ANDROID_FIREBASE_CLIENT_ENV_EXPORTED=true/);
  assert.match(injectScript, /process\.env\.GITHUB_ENV/);
  assert.doesNotMatch(injectScript, /console\.log\([^\n]*androidApiKey/);
});

test('Android signed-AAB workflow fails closed unless the Android Firebase identity was exported', () => {
  assert.match(androidWorkflow, /Inject and validate Firebase Android configuration/);
  assert.match(androidWorkflow, /Verify Android Firebase client selected for Capacitor build/);
  assert.match(androidWorkflow, /\[\[ "\$ANDROID_FIREBASE_CLIENT_ENV_EXPORTED" == 'true' \]\]/);
  assert.match(androidWorkflow, /\[\[ "\$VITE_FIREBASE_APP_ID" =~ \^1:\[0-9\]\+:android:/);
  assert.match(androidWorkflow, /Build and cryptographically verify signed AAB/);
});
