import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

test('live role smoke carries production client expectations and restores protected fixtures', async () => {
  const workflow = await read('.github/workflows/live-role-smoke.yml');
  for (const required of [
    'VITE_GOOGLE_MAPS_API_KEY',
    'VITE_APP_CHECK_SITE_KEY',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_VAPID_KEY',
    'REACT_APP_APP_CHECK_SITE_KEY',
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_ADMIN_FIREBASE_APP_ID',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    'AUTHORIZED_FOUNDER_EMAILS',
    'DEPLOYMENT_ENVIRONMENT: production',
    'PAYMENT_POLICY: phase1-manual',
    "E2E_STRICT_LIVE: 'true'",
    'node scripts/ensure-phase1-manual-payment-config.mjs',
    'node scripts/prepare-protected-business-fixtures.mjs',
  ]) {
    assert.ok(workflow.includes(required), `live-role-smoke.yml must include ${required}`);
  }
});

test('protected fixture repair remains fail-closed to the two production evidence workflows', async () => {
  const source = await read('scripts/prepare-protected-business-fixtures.mjs');
  assert.ok(source.includes("['Firebase Production Deploy', 'Live Role Smoke Tests'].includes(protectedWorkflow)"));
  assert.ok(source.includes("process.env.GITHUB_REF !== 'refs/heads/main'"));
  assert.ok(source.includes("DEPLOYMENT_ENVIRONMENT=production is required"));
  assert.ok(source.includes("PAYMENT_POLICY=phase1-manual is required"));
  assert.ok(source.includes("E2E_STRICT_LIVE=true is required"));
  assert.ok(source.includes('AUTHORIZED_FOUNDER_EMAILS'));
  assert.ok(!source.includes("process.env.GITHUB_WORKFLOW !== 'Firebase Production Deploy'"));
});

test('live hosted rescan preserves deployment provenance and records verifier provenance separately', async () => {
  const source = await read('scripts/verify-production-deployment.mjs');
  for (const required of [
    "process.env.GITHUB_WORKFLOW === 'Live Role Smoke Tests'",
    'const clientEvidenceEnv = liveEvidenceVerification && existing',
    'GITHUB_REPOSITORY: String(existing.repository',
    'GITHUB_REF: String(existing.workflowRef',
    'GITHUB_RUN_ID: String(existing.workflowRunId',
    'GITHUB_RUN_ATTEMPT: String(existing.workflowRunAttempt',
    'env: clientEvidenceEnv',
    'clientRuntimeConfig.verificationWorkflowName',
    'clientRuntimeConfig.verificationWorkflowRunId',
    'clientRuntimeConfig.verificationWorkflowRunAttempt',
  ]) {
    assert.ok(source.includes(required), `verify-production-deployment.mjs must include ${required}`);
  }
});
