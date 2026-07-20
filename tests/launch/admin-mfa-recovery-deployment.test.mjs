import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  mergeAuthorizedDomains,
  REQUIRED_ADMIN_MFA_DOMAINS,
} from '../../scripts/ensure-admin-mfa-authorized-domains.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const guardPath = 'tests/launch/admin-mfa-recovery-deployment.test.mjs';

test('parallel Admin MFA recovery deployment is retired fail closed', async () => {
  const workflow = await read('.github/workflows/admin-mfa-recovery-deploy.yml');
  assert.match(workflow, /Admin MFA Enrollment \(Retired\)/i);
  assert.match(workflow, /Refuse parallel production deployment/i);
  assert.match(workflow, /ADMIN_MFA_BOOTSTRAP_HOSTING/i);
  assert.match(workflow, /exit 1/);
  assert.doesNotMatch(workflow, /id-token:\s*write/i);
  assert.doesNotMatch(workflow, /environment:\s*production/i);
  assert.doesNotMatch(workflow, /google-github-actions\/auth/i);
  assert.doesNotMatch(workflow, /firebase(?:-tools[^\n]*)?\s+deploy/i);
  assert.doesNotMatch(workflow, /--only/i);
});

test('authorized-domain repair is bound to canonical exact-SHA approval context', async () => {
  const secretPreflight = await read('scripts/verify-firebase-production-secrets.mjs');
  const canonicalDeploy = await read('scripts/deploy-firebase-production.mjs');

  assert.match(secretPreflight, /ensureAdminMfaAuthorizedDomains/i);
  assert.match(secretPreflight, /ADMIN_MFA_BOOTSTRAP_HOSTING/i);
  assert.match(secretPreflight, /GITHUB_ACTIONS[^\n]*true/i);
  assert.match(secretPreflight, /refs\/heads\/main/i);
  assert.match(secretPreflight, /workflow_dispatch/i);
  assert.match(secretPreflight, /DEPLOYMENT_ENVIRONMENT[^\n]*production/i);
  assert.match(secretPreflight, /VALIDATED_ARTIFACT_DIGEST/i);
  assert.match(secretPreflight, /predeploy-approval\.json/i);
  assert.match(secretPreflight, /github-environment-protection/i);
  assert.match(secretPreflight, /bank-pilot/i);
  assert.match(secretPreflight, /public release gate must be disabled/i);
  assert.match(secretPreflight, /await domainRepair\(\{ projectId: expectedProjectId \}\)/i);

  const secretsIndex = canonicalDeploy.indexOf('verifyFirebaseProductionSecrets');
  const phoneIndex = canonicalDeploy.indexOf('verifyFirebasePhoneAuthProduction');
  assert.ok(secretsIndex >= 0 && phoneIndex > secretsIndex, 'canonical secret/domain preflight must occur before Phone Auth verification');
  assert.match(canonicalDeploy, /ADMIN_MFA_BOOTSTRAP_HOSTING/);
  assert.match(canonicalDeploy, /complete Firebase production stack/);
});

test('authorized-domain repair preserves existing domains and adds both Admin Hosting domains', () => {
  assert.deepEqual(REQUIRED_ADMIN_MFA_DOMAINS, [
    'bin-group-57c60.web.app',
    'bin-group-57c60.firebaseapp.com',
    'bin-group-admin-panel.web.app',
    'bin-group-admin-panel.firebaseapp.com',
  ]);
  const merged = mergeAuthorizedDomains([
    'example.com',
    'BIN-GROUP-57C60.WEB.APP',
    'example.com',
  ]);
  assert.deepEqual(merged, [
    'example.com',
    'bin-group-57c60.web.app',
    'bin-group-57c60.firebaseapp.com',
    'bin-group-admin-panel.web.app',
    'bin-group-admin-panel.firebaseapp.com',
  ]);
});

test('authorized-domain repair changes only the Identity Toolkit authorizedDomains field', async () => {
  const source = await read('scripts/ensure-admin-mfa-authorized-domains.mjs');
  assert.match(source, /updateMask=authorizedDomains/);
  assert.match(source, /JSON\.stringify\(\{ authorizedDomains \}\)/);
  assert.doesNotMatch(source, /updateMask=.*(?:mfa|signIn|smsRegionConfig)/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /sensitiveValuesExcluded: true/);
});

test('focused launch audit cannot silently restore the parallel recovery deploy', async () => {
  const focusedWorkflow = await read('.github/workflows/five-profile-onboarding-audit.yml');
  assert.equal(focusedWorkflow.split(guardPath).length - 1, 2);
  for (const path of [
    '.github/workflows/admin-mfa-recovery-deploy.yml',
    'scripts/deploy-firebase-production.mjs',
    'scripts/ensure-admin-mfa-authorized-domains.mjs',
    'scripts/verify-firebase-production-secrets.mjs',
  ]) {
    assert.match(focusedWorkflow, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
