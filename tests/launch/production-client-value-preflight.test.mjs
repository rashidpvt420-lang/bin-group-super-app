import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  productionWorkflowEnvSummary,
  REQUIRED_PRODUCTION_VALUES,
  validateProductionWorkflowEnv,
} from '../../scripts/verify-production-workflow-env.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

function validEnv() {
  return {
    GCP_PROJECT_ID: 'bin-group-57c60',
    GCP_WORKLOAD_IDENTITY_PROVIDER: 'projects/123413252227/locations/global/workloadIdentityPools/github/providers/bin-group',
    GCP_SERVICE_ACCOUNT: 'github-production@bin-group-57c60.iam.gserviceaccount.com',
    HARD_LAUNCH_APPROVAL_HMAC_KEY: 'h'.repeat(48),
    AUTHORIZED_FOUNDER_ACTORS: 'rashidpvt420-lang',
    AUTHORIZED_FOUNDER_EMAILS: 'founder@bin-groups.com',
    PRODUCTION_APPROVED_BY: 'founder@bin-groups.com',
    VITE_FIREBASE_API_KEY: `AIza${'A'.repeat(35)}`,
    VITE_FIREBASE_APP_ID: '1:123413252227:web:abcdef1234567890',
    VITE_FIREBASE_MESSAGING_SENDER_ID: '123413252227',
    VITE_FIREBASE_VAPID_KEY: `B${'C'.repeat(86)}`,
    VITE_GOOGLE_MAPS_API_KEY: `AIza${'M'.repeat(35)}`,
    VITE_APP_CHECK_SITE_KEY: `6L${'R'.repeat(38)}`,
    VITE_ENABLE_FIREBASE_APPCHECK: 'true',
    VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: '123e4567-e89b-42d3-a456-426614174000',
    E2E_BASE_URL: 'https://bin-group-57c60.web.app',
    E2E_ADMIN_BASE_URL: 'https://bin-group-admin-panel.web.app',
    E2E_ADMIN_EMAIL: 'admin-e2e@bin-groups.com',
    E2E_ADMIN_PASSWORD: 'admin-password',
    E2E_OWNER_EMAIL: 'owner-e2e@bin-groups.com',
    E2E_OWNER_PASSWORD: 'owner-password',
    E2E_TENANT_EMAIL: 'tenant-e2e@bin-groups.com',
    E2E_TENANT_PASSWORD: 'tenant-password',
    E2E_TECHNICIAN_EMAIL: 'technician-e2e@bin-groups.com',
    E2E_TECHNICIAN_PASSWORD: 'technician-password',
    E2E_BROKER_EMAIL: 'broker-e2e@bin-groups.com',
    E2E_BROKER_PASSWORD: 'broker-password',
    E2E_TECHNICIAN_B_EMAIL: '',
    E2E_TECHNICIAN_B_PASSWORD: '',
    LAUNCH_MODE: 'public',
    RUN_PUBLIC_RELEASE_GATE: 'true',
  };
}

test('production client value preflight accepts exact, separated and well-formed values', () => {
  const env = validEnv();
  assert.deepEqual(validateProductionWorkflowEnv(env), []);
  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('VITE_GOOGLE_MAPS_API_KEY'));
  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('VITE_FIREBASE_VAPID_KEY'));
  assert.ok(REQUIRED_PRODUCTION_VALUES.includes('VITE_ENABLE_FIREBASE_APPCHECK'));
  const summary = productionWorkflowEnvSummary(env);
  assert.equal(summary.projectIdMatched, true);
  assert.equal(summary.mainUrlMatched, true);
  assert.equal(summary.adminUrlMatched, true);
  assert.equal(summary.appCheckEnabled, true);
  assert.equal(summary.firebaseAndMapsKeysSeparated, true);
  assert.equal(summary.sensitiveValuesExcluded, true);
});

test('production client value preflight rejects missing, reused, malformed and placeholder provider values', () => {
  const env = validEnv();
  env.VITE_GOOGLE_MAPS_API_KEY = '';
  assert.match(validateProductionWorkflowEnv(env).join('\n'), /Missing required production value: VITE_GOOGLE_MAPS_API_KEY/);

  const reused = validEnv();
  reused.VITE_GOOGLE_MAPS_API_KEY = reused.VITE_FIREBASE_API_KEY;
  assert.match(validateProductionWorkflowEnv(reused).join('\n'), /separate restricted credentials/);

  const malformed = validEnv();
  malformed.VITE_FIREBASE_APP_ID = 'replace_me';
  malformed.VITE_FIREBASE_MESSAGING_SENDER_ID = 'sender';
  malformed.VITE_FIREBASE_VAPID_KEY = 'YOUR_VAPID_KEY';
  malformed.VITE_APP_CHECK_SITE_KEY = 'short';
  const failures = validateProductionWorkflowEnv(malformed).join('\n');
  assert.match(failures, /VITE_FIREBASE_APP_ID must not contain a placeholder value/);
  assert.match(failures, /Firebase web App ID/);
  assert.match(failures, /numeric Firebase sender ID/);
  assert.match(failures, /VAPID public key/);
  assert.match(failures, /reCAPTCHA site key/);
});

test('production client value preflight binds exact project, identities, URLs and launch mode', () => {
  const env = validEnv();
  env.GCP_PROJECT_ID = 'wrong-project';
  env.GCP_WORKLOAD_IDENTITY_PROVIDER = 'provider-short-name';
  env.GCP_SERVICE_ACCOUNT = 'not-a-service-account';
  env.VITE_ENABLE_FIREBASE_APPCHECK = 'false';
  env.E2E_BASE_URL = 'https://example.com';
  env.E2E_ADMIN_BASE_URL = 'http://bin-group-admin-panel.web.app';
  env.LAUNCH_MODE = 'bank-pilot';
  env.RUN_PUBLIC_RELEASE_GATE = 'true';
  const failures = validateProductionWorkflowEnv(env).join('\n');
  assert.match(failures, /GCP_PROJECT_ID must equal bin-group-57c60/);
  assert.match(failures, /full Workload Identity provider resource name/);
  assert.match(failures, /Google service-account email/);
  assert.match(failures, /VITE_ENABLE_FIREBASE_APPCHECK must equal true/);
  assert.match(failures, /E2E_BASE_URL must equal https:\/\/bin-group-57c60\.web\.app/);
  assert.match(failures, /E2E_ADMIN_BASE_URL must equal https:\/\/bin-group-admin-panel\.web\.app/);
  assert.match(failures, /bank-pilot launch mode requires RUN_PUBLIC_RELEASE_GATE=false/);
});

test('production client value failures never disclose supplied credentials', () => {
  const env = validEnv();
  const firebaseSentinel = 'AIzaSECRET_SENTINEL_VALUE_SHOULD_NEVER_PRINT';
  const mapsSentinel = 'AIzaMAPS_SECRET_SENTINEL_SHOULD_NEVER_PRINT';
  env.VITE_FIREBASE_API_KEY = firebaseSentinel;
  env.VITE_GOOGLE_MAPS_API_KEY = mapsSentinel;
  env.GCP_WORKLOAD_IDENTITY_PROVIDER = 'SECRET_PROVIDER_SENTINEL';
  const output = validateProductionWorkflowEnv(env).join('\n');
  assert.doesNotMatch(output, /SECRET_SENTINEL|MAPS_SECRET|SECRET_PROVIDER/);
  assert.match(output, /VITE_FIREBASE_API_KEY|VITE_GOOGLE_MAPS_API_KEY|GCP_WORKLOAD_IDENTITY_PROVIDER/);
});

test('protected workflow injects Maps and Web Push values before named production verification', async () => {
  const workflow = await read('.github/workflows/firebase-production-deploy.yml');
  assert.match(workflow, /VITE_GOOGLE_MAPS_API_KEY: \$\{\{ secrets\.VITE_GOOGLE_MAPS_API_KEY \}\}/);
  assert.match(workflow, /VITE_FIREBASE_VAPID_KEY: \$\{\{ secrets\.VITE_FIREBASE_VAPID_KEY \}\}/);
  const verifier = workflow.indexOf('node scripts/verify-production-workflow-env.mjs');
  const deploy = workflow.indexOf('node scripts/deploy-firebase-production.mjs');
  assert.ok(verifier >= 0 && deploy > verifier, 'named production values must be verified before deployment');
});
