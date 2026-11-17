import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

const [injectScript, iosWorkflow, gitignore, iosGitignore] = await Promise.all([
  readFile(new URL('../../scripts/inject-ios-google-service-info.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../../.github/workflows/ios-app-store-release.yml', import.meta.url), 'utf8'),
  readFile(new URL('../../.gitignore', import.meta.url), 'utf8'),
  readFile(new URL('../../ios/.gitignore', import.meta.url), 'utf8'),
]);

test('iOS release injects the production Firebase iOS client for the Capacitor WebView bundle', () => {
  assert.match(injectScript, /EXPECTED_BUNDLE_ID = 'ae\.bingroups\.superapp'/);
  assert.match(injectScript, /EXPECTED_PROJECT_ID = 'bin-group-57c60'/);
  assert.match(injectScript, /EXPECTED_IOS_APP_ID = '1:123413252227:ios:3a87d36d147cf47899f3b6'/);
  assert.match(injectScript, /IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64/);
  assert.match(injectScript, /VITE_FIREBASE_API_KEY=\$\{iosApiKey\}/);
  assert.match(injectScript, /VITE_FIREBASE_APP_ID=\$\{iosAppId\}/);
  assert.match(injectScript, /IOS_FIREBASE_CLIENT_ENV_EXPORTED=true/);
  assert.match(injectScript, /process\.env\.GITHUB_ENV/);
  assert.doesNotMatch(injectScript, /console\.log\([^\n]*iosApiKey/);
  assert.doesNotMatch(injectScript, /console\.log\([^\n]*decoded/);
});

test('iOS signed-IPA workflow fails closed unless the iOS Firebase identity secret is present', () => {
  assert.match(iosWorkflow, /secrets\.IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64/);
  assert.match(iosWorkflow, /IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64/);
  assert.match(gitignore, /GoogleService-Info\.plist/);
  assert.match(iosGitignore, /GoogleService-Info\.plist/);
});

test('inject script accepts a valid production plist and rejects a mismatched app id without printing secrets', () => {
  const validPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>API_KEY</key>
	<string>ios-test-api-key-not-for-production</string>
	<key>BUNDLE_ID</key>
	<string>ae.bingroups.superapp</string>
	<key>GCM_SENDER_ID</key>
	<string>123413252227</string>
	<key>GOOGLE_APP_ID</key>
	<string>1:123413252227:ios:3a87d36d147cf47899f3b6</string>
	<key>PROJECT_ID</key>
	<string>bin-group-57c60</string>
</dict>
</plist>
`;
  const wrongAppId = validPlist.replace('3a87d36d147cf47899f3b6', 'deadbeefdeadbeef99f3b6');
  const tmp = mkdtempSync(path.join(tmpdir(), 'ios-gsi-'));
  const cwd = path.join(tmp, 'repo');
  const envPath = path.join(tmp, 'client.env');
  try {
    // The script writes under process.cwd()/ios/App/App/
    spawnSync('mkdir', ['-p', path.join(cwd, 'ios', 'App', 'App')], { stdio: 'ignore' });
    const scriptPath = path.resolve('scripts/inject-ios-google-service-info.mjs');

    const ok = spawnSync(process.execPath, [scriptPath], {
      cwd,
      env: {
        PATH: process.env.PATH,
        IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64: Buffer.from(validPlist, 'utf8').toString('base64'),
        IOS_FIREBASE_CLIENT_ENV_PATH: envPath,
        VITE_FIREBASE_API_KEY: 'hosted-web-key-different',
      },
      encoding: 'utf8',
    });
    assert.equal(ok.status, 0, ok.stderr || ok.stdout);
    assert.match(ok.stdout, /validated and injected Firebase iOS configuration/);
    assert.doesNotMatch(`${ok.stdout}\n${ok.stderr}`, /ios-test-api-key-not-for-production/);
    const written = readFileSync(path.join(cwd, 'ios', 'App', 'App', 'GoogleService-Info.plist'), 'utf8');
    assert.match(written, /ae\.bingroups\.superapp/);
    const exported = readFileSync(envPath, 'utf8');
    assert.match(exported, /VITE_FIREBASE_APP_ID=1:123413252227:ios:3a87d36d147cf47899f3b6/);
    assert.match(exported, /IOS_FIREBASE_CLIENT_ENV_EXPORTED=true/);

    const bad = spawnSync(process.execPath, [scriptPath], {
      cwd,
      env: {
        PATH: process.env.PATH,
        IOS_GOOGLE_SERVICE_INFO_PLIST_BASE64: Buffer.from(wrongAppId, 'utf8').toString('base64'),
        IOS_FIREBASE_CLIENT_ENV_PATH: path.join(tmp, 'bad.env'),
      },
      encoding: 'utf8',
    });
    assert.notEqual(bad.status, 0);
    assert.match(`${bad.stderr}\n${bad.stdout}`, /does not match the production BIN GROUP iOS app/);
    assert.doesNotMatch(`${bad.stdout}\n${bad.stderr}`, /ios-test-api-key-not-for-production/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
