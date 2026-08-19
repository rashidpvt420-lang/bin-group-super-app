import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { existsSync } from 'node:fs';

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
  return 'bash';
}

const bash = resolveBash();

function extractFunction(name) {
  const match = androidScript.match(new RegExp(`${name}\\(\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Android release script must define ${name}().`);
  return match[0];
}

const normalizeSha256 = extractFunction('normalize_sha256');
const extractApksignerLines = extractFunction('extract_apksigner_sha256_lines');
const resolveApksignerSha256 = extractFunction('resolve_apksigner_sha256');

async function resolveReport(report) {
  const dir = await mkdtemp(join(tmpdir(), 'bin-group-apksigner-'));
  const reportPath = join(dir, 'apksigner.txt');
  await writeFile(reportPath, report, 'utf8');
  try {
    return spawnSync(
      bash,
      [
        '-c',
        [
          normalizeSha256,
          extractApksignerLines,
          resolveApksignerSha256,
          'resolve_apksigner_sha256 "$1"',
        ].join('\n'),
        'resolve-apksigner',
        reportPath,
      ],
      { encoding: 'utf8' },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('Android signer parser accepts legacy apksigner signer-number output', async () => {
  const digest = 'A1'.repeat(32);
  const result = await resolveReport(
    `Verifies\nSigner #1 certificate SHA-256 digest: ${digest.toLowerCase()}\n`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, digest);
});

test('Android signer parser accepts the exact V2 scheme-prefixed production output', async () => {
  const digest = '431aec82d731f2a6ed2521ac529722fcb4a51614ac857a20ab96da2d767bee91';
  const result = await resolveReport(
    [
      'Verifies',
      'Verified using v2 scheme (APK Signature Scheme v2): true',
      'Number of signers: 1',
      'V2 Signer: certificate DN: CN=BIN GROUP Android Upload, OU=Mobile Release, O=BIN GROUP General Maintenance and Property Management LLC, L=Al Ain, ST=Abu Dhabi, C=AE',
      `V2 Signer: certificate SHA-256 digest: ${digest}`,
      'V2 Signer: certificate SHA-1 digest: d131bbad40cdd876b51e6db0b48d4d00de6e4561',
      'V2 Signer: public key SHA-256 digest: 4c12ece462b07996ef8eca064c56a0b47c1197f15a3f3c77734f1fd2c250cdf9',
      '',
    ].join('\n'),
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, digest.toUpperCase());
});

test('Android signer parser accepts scheme-prefixed labels with dotted signature versions', async () => {
  const digest = 'F6'.repeat(32);
  const result = await resolveReport(
    `V3.1 Signer: certificate SHA-256 digest: ${digest.toLowerCase()}\n`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, digest);
});

test('Android signer parser accepts apksigner v3.1 SDK-range output', async () => {
  const digest = 'B2'.repeat(32);
  const result = await resolveReport(
    [
      'Verifies',
      `Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${digest.toLowerCase()}`,
      `Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${digest.toLowerCase()}`,
      '',
    ].join('\n'),
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, digest);
});

test('Android signer parser accepts v3.1 dev-release labels and surrounding whitespace', async () => {
  const digest = 'C3'.repeat(32);
  const coloned = digest.match(/.{2}/g).join(':').toLowerCase();
  const result = await resolveReport(
    `  Signer (minSdkVersion=35 (dev release=true), maxSdkVersion=2147483647) certificate SHA-256 digest:   ${coloned}  \n`,
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, digest);
});

test('Android signer parser ignores public-key SHA-256 rows', async () => {
  const result = await resolveReport(
    'V2 Signer: public key SHA-256 digest: 4c12ece462b07996ef8eca064c56a0b47c1197f15a3f3c77734f1fd2c250cdf9\n',
  );
  assert.notEqual(result.status, 0, 'Public-key evidence must not substitute for certificate evidence.');
});

test('Android signer parser fails closed on distinct signer fingerprints', async () => {
  const first = 'D4'.repeat(32).toLowerCase();
  const second = 'E5'.repeat(32).toLowerCase();
  const result = await resolveReport(
    [
      `V2 Signer: certificate SHA-256 digest: ${first}`,
      `V3.1 Signer: certificate SHA-256 digest: ${second}`,
      '',
    ].join('\n'),
  );
  assert.equal(result.status, 2, 'Distinct APK signer fingerprints must fail closed.');
});

test('Android signer parser fails closed when no supported SHA-256 signer line exists', async () => {
  const result = await resolveReport('Verifies\nNumber of signers: 1\n');
  assert.notEqual(result.status, 0, 'Missing signer certificate evidence must fail closed.');
});
