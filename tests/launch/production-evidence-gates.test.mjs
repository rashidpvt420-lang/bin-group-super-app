import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production deploy rate-limits discovered Cloud Functions instead of mutating the full fleet at once', async () => {
  const [deploy, batched] = await Promise.all([
    read('scripts/deploy-firebase-production.mjs'),
    read('scripts/deploy-firebase-functions-batched.mjs'),
  ]);

  assert.match(deploy, /deploy-firebase-functions-batched\.mjs/);
  assert.match(deploy, /hosting,firestore:rules,firestore:indexes,storage/);
  assert.doesNotMatch(deploy, /functions,hosting,firestore:rules,firestore:indexes,storage/);
  assert.match(batched, /const BATCH_SIZE = 8/);
  assert.match(batched, /const INTER_BATCH_DELAY_SECONDS = 75/);
  assert.match(batched, /value\.__endpoint \|\| value\.__trigger/);
  assert.match(batched, /functions:\$\{name\}/);
  assert.match(batched, /cooling down/);
  assert.match(batched, /functions-deployment-plan\.json/);
  assert.match(batched, /DEPLOYMENT_ENVIRONMENT !== 'production'/);
  assert.match(batched, /GITHUB_REF !== 'refs\/heads\/main'/);
});

test('strict role verification requires Founder credentials only for Founder MFA evidence', async () => {
  const source = await read('scripts/verify-e2e-env.mjs');
  assert.match(source, /founderEvidenceRequired = process\.env\.E2E_REQUIRE_FOUNDER_MFA === 'true'/);
  assert.match(source, /founderEvidenceRequired \? \['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD'\] : \[\]/);
  assert.match(source, /if \(!founderEvidenceRequired\) return \[\]/);
  assert.doesNotMatch(source, /strictRoles \? \['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD'\]/);
});

test('finance replay completes canonical Founder TOTP and verifies second-factor authentication', async () => {
  const [workflow, verifier, helper] = await Promise.all([
    read('.github/workflows/operational-application-evidence.yml'),
    read('scripts/verify-operational-application-evidence.mjs'),
    read('scripts/lib/firebase-mfa-sign-in.mjs'),
  ]);

  assert.match(workflow, /E2E_FOUNDER_EMAIL:\s*\$\{\{ secrets\.E2E_FOUNDER_EMAIL \}\}/);
  assert.match(workflow, /E2E_FOUNDER_PASSWORD:\s*\$\{\{ secrets\.E2E_FOUNDER_PASSWORD \}\}/);
  assert.match(workflow, /E2E_FOUNDER_TOTP_SECRET:\s*\$\{\{ secrets\.E2E_FOUNDER_TOTP_SECRET \}\}/);
  assert.match(verifier, /signInWithRequiredTotpMfa/);
  assert.match(verifier, /email !== 'ceo@bin-groups\.com'/);
  assert.match(verifier, /replaySecondFactorHash/);
  assert.match(helper, /accounts\/mfaSignIn:finalize/);
  assert.match(helper, /totpVerificationInfo: \{ verificationCode \}/);
  assert.match(helper, /firebase\?\.sign_in_second_factor/);
  assert.doesNotMatch(helper, /return \{ idToken: directToken/);
});

test('operational provenance paginates all matching documents before deployment-time filtering', async () => {
  const source = await read('scripts/verify-operational-application-provenance.mjs');
  assert.match(source, /async function readAllMatchingDocuments/);
  assert.match(source, /FieldPath\.documentId\(\)/);
  assert.match(source, /startAfter\(cursor\)/);
  assert.match(source, /documents = await readAllMatchingDocuments\(query\)/);
  assert.match(source, /scannedDocumentCount: documents\.length/);
  assert.doesNotMatch(source, /const snapshot = await query\.limit\(100\)\.get\(\)/);
});
