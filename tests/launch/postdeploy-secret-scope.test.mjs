import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function scopes(workflow, stepName, nextStepName) {
  const stepsIndex = workflow.indexOf('\n    steps:');
  const stepIndex = workflow.indexOf(`- name: ${stepName}`);
  const nextIndex = workflow.indexOf(`- name: ${nextStepName}`, stepIndex + 1);
  assert.ok(stepsIndex >= 0 && stepIndex > stepsIndex && nextIndex > stepIndex);
  return {
    job: workflow.slice(0, stepsIndex),
    step: workflow.slice(stepIndex, nextIndex),
  };
}

function requireSecretOnlyInStep(workflow, scope, names) {
  for (const name of names) {
    assert.doesNotMatch(scope.job, new RegExp(`${name}:`), `${name} must not exist at job scope`);
    assert.ok(scope.step.includes(`${name}: \${{ secrets.${name} }}`), `${name} must be injected into only the protected execution step`);
  }
  const total = names.reduce((count, name) => count + (workflow.match(new RegExp(`${name}:`, 'g')) || []).length, 0);
  assert.equal(total, names.length, 'each protected credential must appear exactly once in its workflow');
}

test('postdeploy application evidence keeps Founder and App Check credentials out of checkout and setup steps', async () => {
  const workflow = await read('.github/workflows/postdeploy-operational-application-evidence.yml');
  const scope = scopes(
    workflow,
    'Auto-discover, verify, and publish all application evidence',
    'Upload deployment-triggered application proof batch',
  );
  requireSecretOnlyInStep(workflow, scope, [
    'E2E_FOUNDER_EMAIL',
    'E2E_FOUNDER_PASSWORD',
    'E2E_FOUNDER_TOTP_SECRET',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
  ]);
  assert.doesNotMatch(workflow, /E2E_ADMIN_EMAIL:|E2E_ADMIN_PASSWORD:/);
});

test('postdeploy provider credentials are scoped to SMTP and App Check verifier steps', async () => {
  const workflow = await read('.github/workflows/postdeploy-operational-provider-evidence.yml');
  const stepsIndex = workflow.indexOf('\n    steps:');
  const jobScope = workflow.slice(0, stepsIndex);
  for (const name of [
    'E2E_ADMIN_EMAIL',
    'E2E_TENANT_EMAIL',
    'E2E_TENANT_PASSWORD',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
  ]) assert.doesNotMatch(jobScope, new RegExp(`${name}:`));

  const smtpScope = scopes(workflow, 'Verify BIN GROUP branded SMTP delivery', 'Verify production App Check enforcement');
  assert.ok(smtpScope.step.includes('E2E_ADMIN_EMAIL: ${{ secrets.E2E_ADMIN_EMAIL }}'));
  const appCheckScope = scopes(workflow, 'Verify production App Check enforcement', 'Publish and finalize baseline provider evidence');
  for (const name of [
    'E2E_TENANT_EMAIL',
    'E2E_TENANT_PASSWORD',
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN',
  ]) assert.ok(appCheckScope.step.includes(`${name}: \${{ secrets.${name} }}`));
});

test('postdeploy privileged Admin credentials are scoped only to the authentication proof step', async () => {
  const workflow = await read('.github/workflows/postdeploy-privileged-access-rotation-evidence.yml');
  const scope = scopes(
    workflow,
    'Prove rotated Admin credential is accepted by Firebase Auth',
    'Verify provider-backed credential rotation',
  );
  requireSecretOnlyInStep(workflow, scope, [
    'E2E_ADMIN_EMAIL',
    'E2E_ADMIN_PASSWORD',
    'VITE_FIREBASE_API_KEY',
  ]);
});
