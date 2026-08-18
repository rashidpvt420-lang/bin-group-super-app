import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(
  new URL('../../scripts/run-android-store-release.sh', import.meta.url),
  'utf8',
);

const compromisedFingerprint = '431AEC82D731F2A6ED2521AC529722FCB4A51614AC857A20AB96DA2D767BEE91';

test('Android release permanently denies the upload certificate exposed in public Git history', () => {
  assert.match(script, new RegExp(`COMPROMISED_UPLOAD_CERT_SHA256="${compromisedFingerprint}"`));
  assert.match(script, /preflight_keystore_sha256=/);
  assert.match(script, /if \[\[ "\$preflight_keystore_sha256" == "\$COMPROMISED_UPLOAD_CERT_SHA256" \]\]; then/);
  assert.match(script, /Refusing Android release: the configured production upload key is the compromised credential exposed in public Git history/);
});

test('compromised-key rejection happens before dependency install and Android build', () => {
  const rejection = script.indexOf('configured production upload key is the compromised credential');
  const install = script.indexOf('npm ci --include=optional --legacy-peer-deps');
  const gradle = script.indexOf('bash ./gradlew --no-daemon clean :app:assembleRelease :app:bundleRelease');
  assert.ok(rejection >= 0);
  assert.ok(install > rejection);
  assert.ok(gradle > rejection);
});
