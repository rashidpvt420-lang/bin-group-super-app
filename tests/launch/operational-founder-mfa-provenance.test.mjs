import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const url = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFile(url(path), 'utf8');

test('operational MFA and provenance scripts parse under the repository Node runtime', () => {
  for (const path of [
    'scripts/lib/firebase-mfa-sign-in.mjs',
    'scripts/verify-operational-application-evidence-mfa.mjs',
    'scripts/verify-operational-application-provenance.mjs',
    'scripts/publish-operational-application-evidence.mjs',
  ]) {
    const filename = fileURLToPath(url(path));
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${path} failed Node syntax validation:\n${result.stderr || result.stdout}`);
  }
});

test('operational evidence scopes canonical Founder credentials to the static MFA verifier', async () => {
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
  assert.match(evidenceScope, /verify-operational-application-evidence-mfa\.mjs/);
  assert.doesNotMatch(workflow, /run-operational-application-evidence-paginated\.mjs|--prepare-in-place/);
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

test('finance replay publishes and validates the unique Founder TOTP hash', async () => {
  const [wrapper, publisher] = await Promise.all([
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
    read('scripts/publish-operational-application-evidence.mjs'),
  ]);

  assert.match(wrapper, /signInWithRequiredTotpMfa/);
  assert.match(wrapper, /verifiedMfa\?\.secondFactorType !== 'totp'/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactorIdentifier\)/);
  assert.doesNotMatch(wrapper, /sha256\(verifiedMfa\.secondFactorType\)/);
  const requiredHashChecks = publisher.match(/requiredHash\(e\.replaySecondFactorHash, 'replaySecondFactorHash', errors\)/g) || [];
  assert.equal(requiredHashChecks.length, 2, 'both finance replay publishers must require the Founder TOTP hash');
});

test('operational provenance and application evidence paginate complete matching collections', async () => {
  const [provenance, wrapper] = await Promise.all([
    read('scripts/verify-operational-application-provenance.mjs'),
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
  ]);

  assert.match(provenance, /const PAGE_SIZE = 250/);
  assert.match(provenance, /async function readAllMatchingDocuments/);
  assert.match(provenance, /FieldPath\.documentId\(\)/);
  assert.match(provenance, /startAfter\(cursor\)/);
  assert.match(provenance, /const documents = await readAllMatchingDocuments\(query\)/);
  assert.match(provenance, /scannedDocumentCount: documents\.length/);
  assert.match(provenance, /entry\.observedMs >= deployedAt\.getTime\(\)/);
  assert.doesNotMatch(provenance, /const snapshot = await query\.limit\(100\)\.get\(\)/);

  assert.match(wrapper, /const PAGE_SIZE = 250/);
  assert.match(wrapper, /async function readAllMatchingSnapshot/);
  assert.match(wrapper, /FieldPath\.documentId\(\)/);
  assert.match(wrapper, /startAfter\(cursor\)/);
  assert.match(wrapper, /function installPaginatedQueryProxy/);
  assert.match(wrapper, /property === 'limit'/);
  assert.match(wrapper, /get: \(\) => readAllMatchingSnapshot\(target\)/);
  assert.match(wrapper, /restoreCollection\(\)/);
  assert.doesNotMatch(wrapper, /renameSync|temporaryPath|--prepare-in-place/);
});