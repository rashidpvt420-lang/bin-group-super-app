import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('production readiness preflight is protected, exact-main and read-only', async () => {
  const workflow = await read('.github/workflows/production-readiness-preflight.yml');

  assert.match(workflow, /name: Production Readiness Preflight/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /VERIFY_PRODUCTION_READINESS_BIN_GROUP_57C60/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" == "refs\/heads\/main" \]\]/);
  assert.match(workflow, /check-firebase-production-secret-metadata\.mjs/);
  assert.match(workflow, /verify-firebase-phone-auth-production\.mjs/);
  assert.match(workflow, /verify-admin-mfa-production\.mjs/);
  assert.match(workflow, /FIREBASE_PHONE_AUTH_REQUIRED_SMS_REGION: AE/);
  for (const domain of [
    'bin-group-57c60.web.app',
    'bin-group-57c60.firebaseapp.com',
    'bin-group-admin-panel.web.app',
    'bin-group-admin-panel.firebaseapp.com',
  ]) {
    assert.match(workflow, new RegExp(domain.replaceAll('.', '\\.')));
  }
  assert.match(workflow, /Active Admin MFA and recovery quorum: passed/);
  assert.match(workflow, /Deployment performed: no/);
  assert.match(workflow, /Hard-launch claim: false/);
  assert.doesNotMatch(workflow, /firebase\s+deploy|deploy-firebase-production\.mjs|hosting:admin|functions:/i);
});

test('secret metadata preflight reuses the canonical launch-mode secret contract', async () => {
  const [checker, verifier] = await Promise.all([
    read('scripts/check-firebase-production-secret-metadata.mjs'),
    read('scripts/verify-firebase-production-secrets.mjs'),
  ]);

  assert.match(checker, /verifyFirebaseSecretMetadata/);
  assert.match(checker, /secretValuesExcluded: true/);
  assert.match(checker, /deploymentPerformed: false/);
  assert.match(checker, /hardLaunchClaim: false/);
  assert.doesNotMatch(checker, /OPENAI_API_KEY|IMAGE_GENERATION_API_KEY|GEMINI_API_KEY|SMTP_PASS|STRIPE_SECRET_KEY/);

  assert.match(verifier, /export async function verifyFirebaseSecretMetadata/);
  assert.match(verifier, /requiredFirebaseProductionSecretsForMode\(launchMode\)/);
  assert.match(verifier, /verifiedSecretNames/);
  assert.match(verifier, /return verifyFirebaseSecretMetadata\(\{ projectId, launchMode, firebaseClient \}\)/);
});
