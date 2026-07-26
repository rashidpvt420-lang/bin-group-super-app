import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const url = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFile(url(path), 'utf8');

test('operational MFA and pagination scripts parse under the repository Node runtime', () => {
  for (const path of [
    'scripts/lib/firebase-mfa-sign-in.mjs',
    'scripts/run-operational-application-evidence-paginated.mjs',
    'scripts/verify-operational-application-provenance.mjs',
  ]) {
    const filename = fileURLToPath(url(path));
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${path} failed Node syntax validation:\n${result.stderr || result.stdout}`);
  }
});

test('operational evidence scopes canonical Founder credentials and prepares the canonical verifier', async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  const steps = workflow.indexOf('\n    steps:');
  const evidenceStep = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const uploadStep = workflow.indexOf('- name: Upload application proof batch');
  const jobScope = workflow.slice(0, steps);
  const evidenceScope = workflow.slice(evidenceStep, uploadStep);

  assert.doesNotMatch(jobScope, /E2E_FOUNDER_EMAIL:|E2E_FOUNDER_PASSWORD:|E2E_FOUNDER_TOTP_SECRET:/);
  assert.match(evidenceScope, /E2E_FOUNDER_EMAIL:\s*\$\{\{ secrets\.E2E_FOUNDER_EMAIL \}\}/);
  assert.match(evidenceScope, /E2E_FOUNDER_PASSWORD:\s*\$\{\{ secrets\.E2E_FOUNDER_PASSWORD \}\}/);
  assert.match(evidenceScope, /E2E_FOUNDER_TOTP_SECRET:\s*\$\{\{ secrets\.E2E_FOUNDER_TOTP_SECRET \}\}/);
  assert.match(evidenceScope, /run-operational-application-evidence-paginated\.mjs --prepare-in-place/);
  assert.match(evidenceScope, /verify-operational-application-evidence\.mjs/);
  assert.doesNotMatch(workflow, /verify-operational-application-evidence-mfa\.mjs/);
});

test('Firebase operational replay requires server-verified canonical Founder TOTP', async () => {
  const helper = await read('scripts/lib/firebase-mfa-sign-in.mjs');

  assert.match(helper, /accounts\/mfaSignIn:finalize/);
  assert.match(helper, /totpVerificationInfo: \{ verificationCode \}/);
  assert.match(helper, /verifyIdToken\(idToken, true\)/);
  assert.match(helper, /sign_in_second_factor/);
  assert.match(helper, /second_factor_identifier/);
  assert.match(helper, /email_verified !== true/);
  assert.match(helper, /CEO or Super Admin Founder authority/);
  assert.match(helper, /verified\.secondFactorIdentifier !== enrollmentId/);
  assert.doesNotMatch(helper, /response\.text\(\)|raw:\s*raw/);
});

test('finance replay is bound to unique MFA hashes in the prepared canonical verifier', async () => {
  const runner = await read('scripts/run-operational-application-evidence-paginated.mjs');

  assert.match(runner, /email !== 'ceo@bin-groups\.com'/);
  assert.match(runner, /signInWithRequiredTotpMfa/);
  assert.match(runner, /secondFactorIdentifier: founderAuth\.secondFactorIdentifier/);
  assert.match(runner, /secondFactorHash: sha256\(auth\.secondFactorIdentifier\)/);
  assert.match(runner, /'sha256\(auth\.secondFactor\)'/);
  assert.doesNotMatch(runner, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactor\)/);
});

test('operational provenance and application evidence paginate complete matching collections', async () => {
  const [provenance, runner] = await Promise.all([
    read('scripts/verify-operational-application-provenance.mjs'),
    read('scripts/run-operational-application-evidence-paginated.mjs'),
  ]);

  assert.match(provenance, /const PAGE_SIZE = 250/);
  assert.match(provenance, /async function readAllMatchingDocuments/);
  assert.match(provenance, /FieldPath\.documentId\(\)/);
  assert.match(provenance, /startAfter\(cursor\)/);
  assert.match(provenance, /const documents = await readAllMatchingDocuments\(query\)/);
  assert.match(provenance, /scannedDocumentCount: documents\.length/);
  assert.match(provenance, /entry\.observedMs >= deployedAt\.getTime\(\)/);
  assert.doesNotMatch(provenance, /const snapshot = await query\.limit\(100\)\.get\(\)/);

  assert.match(runner, /const PAGE_SIZE = 250/);
  assert.match(runner, /readAllMatchingDocuments/);
  assert.match(runner, /readAllMatchingSnapshot/);
  assert.match(runner, /Owner property count query/);
  assert.match(runner, /payment invoice exactly-once queries/);
  assert.match(runner, /payment audit exactly-once queries/);
  assert.match(runner, /commission exactly-once queries/);
  assert.match(runner, /staff creation audit count query/);
});
