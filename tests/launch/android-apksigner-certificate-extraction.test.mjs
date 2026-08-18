import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const androidScript = await readFile(
  new URL('../../scripts/run-android-store-release.sh', import.meta.url),
  'utf8',
);

function resolveBash() {
  const candidates = [
    'bash',
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    'C:\\msys64\\usr\\bin\\bash.exe',
  ];
  for (const candidate of candidates) {
    if (candidate !== 'bash' && !existsSync(candidate)) continue;
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    if (result.status === 0 && /GNU bash/.test(result.stdout)) return candidate;
  }
  return null;
}

function extractionFunction() {
  const match = androidScript.match(/extract_apksigner_certificate_sha256\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(match, 'Android release script must define extract_apksigner_certificate_sha256().');
  return match;
}

function extract(report) {
  const bash = resolveBash();
  assert.ok(bash, 'A usable GNU Bash executable is required for APK certificate extraction tests.');
  return spawnSync(
    bash,
    ['-c', `${extractionFunction()}\nextract_apksigner_certificate_sha256 /dev/stdin`],
    { encoding: 'utf8', input: report },
  );
}

test('APK certificate extraction tolerates harmless apksigner formatting differences', () => {
  const bare = 'A1'.repeat(32);
  const coloned = bare.match(/.{2}/g).join(':').toLowerCase();
  const reports = [
    `Signer #1 certificate SHA-256 digest: ${bare}\n`,
    `   signer   #1   certificate   sha-256   digest :   ${coloned}   \r\n`,
    `Verified using v2 scheme (APK Signature Scheme v2): true\nSigner #1 certificate SHA-256 digest: ${bare} (upload certificate)\n`,
  ];

  for (const report of reports) {
    const result = extract(report);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout, bare);
  }
});

test('APK certificate extraction ignores unrelated digests and fails closed on ambiguity', () => {
  const first = 'A1'.repeat(32);
  const second = 'B2'.repeat(32);

  const unrelated = extract(
    `APK SHA-256 digest: ${second}\nSigner #1 certificate SHA-256 digest: ${first}\n`,
  );
  assert.equal(unrelated.status, 0, unrelated.stderr || unrelated.stdout);
  assert.equal(unrelated.stdout, first);

  const ambiguous = extract(
    `Signer #1 certificate SHA-256 digest: ${first}\nSigner #2 certificate SHA-256 digest: ${second}\n`,
  );
  assert.notEqual(ambiguous.status, 0, 'Distinct signer certificate fingerprints must fail closed.');

  const malformed = extract('Signer #1 certificate SHA-256 digest: AA:BB\n');
  assert.notEqual(malformed.status, 0, 'Malformed certificate fingerprints must fail closed.');
});

test('Android release captures the complete apksigner report before parsing', () => {
  assert.match(
    androidScript,
    /apksigner.*verify --verbose --print-certs[\s\S]*> "\$apk_signing_report" 2>&1/,
  );
  assert.match(androidScript, /extract_apksigner_certificate_sha256 "\$apk_signing_report"/);
});
