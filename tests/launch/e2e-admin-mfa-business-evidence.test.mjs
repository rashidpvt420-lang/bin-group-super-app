import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const manager = await read('scripts/manage-e2e-admin-mfa-test.mjs');
const wrapper = await read('scripts/run-protected-business-evidence.mjs');
const login = await read('apps/admin-panel/src/components/UnifiedLogin.tsx');
const adminSpec = await read('tests/e2e/business-admin.spec.ts');
const technicianSpec = await read('tests/e2e/business-technician.spec.ts');
const packageJson = JSON.parse(await read('package.json'));

test('temporary E2E Admin MFA uses protected Identity Platform configuration and removes it', () => {
  assert.match(manager, /EXPECTED_PROJECT_ID = 'bin-group-57c60'/);
  assert.match(manager, /EXPECTED_REPOSITORY = 'rashidpvt420-lang\/bin-group-super-app'/);
  assert.match(manager, /Firebase Production Deploy/);
  assert.match(manager, /Live Business Failure Diagnostics/);
  assert.match(manager, /Canonical Founder protection refused E2E MFA provisioning/);
  assert.match(manager, /claims\.testAccount !== true/);
  assert.match(manager, /signIn\.phoneNumber\.testPhoneNumbers/);
  assert.match(manager, /multiFactor:[\s\S]*enrolledFactors/);
  assert.match(manager, /factorId: 'phone'/);
  assert.match(manager, /delete existing\[runtime\.phoneNumber\]/);
  assert.match(manager, /rmSync\(RUNTIME_PATH/);
  assert.match(manager, /mode: 0o600/);
  assert.doesNotMatch(manager, /verificationCode.*console\.log|console\.log.*verificationCode/);
  assert.match(manager, /hardLaunchClaim: false/);
});

test('business wrapper binds the protected production sentinel to the exact deploy job and always cleans up', () => {
  const tryIndex = wrapper.indexOf('try {');
  const finallyIndex = wrapper.indexOf('} finally {');
  const prepareIndex = wrapper.indexOf("['--mode', 'prepare']");
  const evidenceIndex = wrapper.indexOf("['--suite', 'all-business']");
  const cleanupIndex = wrapper.indexOf("['--mode', 'cleanup']");
  assert.ok(tryIndex >= 0 && prepareIndex > tryIndex);
  assert.ok(evidenceIndex > prepareIndex);
  assert.ok(finallyIndex > evidenceIndex);
  assert.ok(cleanupIndex > finallyIndex);
  assert.match(wrapper, /DEPLOY_WORKFLOW = 'Firebase Production Deploy'/);
  assert.match(wrapper, /DEPLOY_JOB = 'deploy-firebase-production-stack'/);
  assert.match(wrapper, /env\.GITHUB_ACTIONS === 'true'/);
  assert.match(wrapper, /env\.GITHUB_REF === 'refs\/heads\/main'/);
  assert.match(wrapper, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(wrapper, /DEPLOYMENT_ENVIRONMENT: 'production'/);
  assert.match(wrapper, /env: evidenceEnv/);
  assert.equal(packageJson.scripts['test:e2e:business'], 'node scripts/run-protected-business-evidence.mjs');
});

test('Admin browser disables app verification only for webdriver, marker, and canonical Admin host', () => {
  assert.match(login, /window\.navigator\.webdriver === true/);
  assert.match(login, /bin-e2e-admin-mfa-test/);
  assert.match(login, /bin-group-admin-panel\.web\.app/);
  assert.match(login, /bin-group-admin-panel\.firebaseapp\.com/);
  assert.match(login, /auth\.settings\.appVerificationDisabledForTesting = true/);
  assert.match(login, /localStorage\.removeItem\('bin-e2e-admin-mfa-test'\)/);
});

test('Admin business evidence completes the actual Firebase MFA challenge', () => {
  assert.match(adminSpec, /\.e2e-admin-mfa-runtime\.json/);
  assert.match(adminSpec, /admin-mfa-signin-challenge/);
  assert.match(adminSpec, /admin-mfa-send-signin-code/);
  assert.match(adminSpec, /admin-mfa-signin-code/);
  assert.match(adminSpec, /admin-mfa-resolve-signin/);
  assert.match(adminSpec, /the protected E2E Admin must receive a real Firebase MFA challenge/);
  assert.doesNotMatch(adminSpec, /mfaBypass|skipMfa|secondFactor.*customClaims/);
});

test('Technician evidence waits for actual EN_ROUTE Firestore state', () => {
  assert.match(technicianSpec, /\.MuiChip-label/);
  assert.match(technicianSpec, /\^EN ROUTE\$/);
  assert.match(technicianSpec, /static button text is not transition evidence/);
  assert.match(technicianSpec, /'Arrival action', 35_000/);
  assert.doesNotMatch(technicianSpec, /toContainText\(\/EN ROUTE\|On The Way\|Status updated/);
});
