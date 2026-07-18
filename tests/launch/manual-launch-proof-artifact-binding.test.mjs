import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('manual launch proof recorder requires an artifact and current commit binding', async () => {
  const source = await read('scripts/record-launch-proof.mjs');
  assert.match(source, /argValue\('artifact'\)/);
  assert.match(source, /launch_package\/artifacts/);
  assert.match(source, /sha256File\(artifact\.absolutePath\)/);
  assert.match(source, /commitSha = gitSha\(process\.cwd\(\)\)/);
  assert.match(source, /artifactHash: `sha256:/);
  assert.match(source, /evidenceType: 'manual-artifact'/);
  assert.match(source, /executionGenerated: false/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /deployment proof and cannot be marked passed manually/);
  assert.doesNotMatch(source, /tester = argValue\('tester'\) \|\|/);
  assert.doesNotMatch(source, /testedAt = argValue\('testedAt'\) \|\|/);
});

test('launch clearance verifies artifact path, hash, size, age, and exact SHA', async () => {
  const source = await read('scripts/verify-launch-clearance.mjs');
  assert.match(source, /validateManualArtifact/);
  assert.match(source, /manual proof; protected production deployment evidence is required/);
  assert.match(source, /gate\.evidenceType !== 'manual-artifact'/);
  assert.match(source, /gate\.executionGenerated !== false/);
  assert.match(source, /gate\.hardLaunchClaim !== false/);
  assert.match(source, /String\(gate\.commitSha \|\| ''\) !== sha/);
  assert.match(source, /artifactPath\.startsWith\('launch_package\/artifacts\/'\)/);
  assert.match(source, /artifactBytes !== stat\.size/);
  assert.match(source, /sha256File\(absolutePath\)/);
  assert.match(source, /manual proof is older than 30 days/);
  assert.match(source, /if \(superseded\) return/);
});

test('launch pass remains the guarded artifact recorder', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  assert.equal(packageJson.scripts['launch:pass'], 'node scripts/record-launch-proof.mjs');
  assert.match(String(packageJson.scripts['launch:evidence:run']), /run-critical-evidence\.mjs/);
});
