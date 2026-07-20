import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const [
  grantScript,
  verifyScript,
  deployGuide,
  deploymentChecklist,
  adminGuide,
  focusedWorkflow,
] = await Promise.all([
  read('scripts/grant-admin.mjs'),
  read('scripts/verify-admin-access.mjs'),
  read('DEPLOY.md'),
  read('docs/DEPLOYMENT.md'),
  read('ADMIN_COMMAND_CENTER.md'),
  read('.github/workflows/five-profile-onboarding-audit.yml'),
]);

const guardPath = 'tests/launch/protected-admin-deployment-docs.test.mjs';
const privilegedMutationPattern = /\.(?:createUser|updateUser|setCustomUserClaims)\s*\(|adminApproved\s*:/i;

test('retired local Admin grant entrypoint cannot mutate production authority', () => {
  assert.match(grantScript, /REFUSED/i);
  assert.match(grantScript, /adminCreateUser/i);
  assert.match(grantScript, /protected Admin MFA bootstrap workflow/i);
  assert.doesNotMatch(grantScript, /initializeApp|applicationDefault|service-account\.json|serviceAccountKey\.json/i);
  assert.doesNotMatch(grantScript, privilegedMutationPattern);
  assert.doesNotMatch(grantScript, /passwordArg|BIN_ADMIN_PASSWORD/i);
});

test('Admin verification remains read-only and never recommends the retired grant script', () => {
  assert.match(verifyScript, /READ-ONLY ADMIN ACCESS VERIFICATION/i);
  assert.match(verifyScript, /adminCreateUser/i);
  assert.doesNotMatch(verifyScript, /Run node scripts\/grant-admin\.mjs/i);
  assert.doesNotMatch(verifyScript, privilegedMutationPattern);
  assert.doesNotMatch(verifyScript, /\.set\s*\(|\.add\s*\(/i);
});

test('current deployment and Admin guides prohibit local production bypasses', () => {
  for (const [name, source] of [
    ['DEPLOY.md', deployGuide],
    ['docs/DEPLOYMENT.md', deploymentChecklist],
    ['ADMIN_COMMAND_CENTER.md', adminGuide],
  ]) {
    assert.doesNotMatch(source, /^\s*firebase\s+deploy\b/im, `${name} must not contain executable local production deploy commands`);
    assert.doesNotMatch(source, /node\s+scripts\/grant-admin\.mjs\s+<email>/i, `${name} must not instruct local Admin escalation`);
    assert.doesNotMatch(source, /deploy-production\.ps1/i, `${name} must not reference retired production deployment helpers`);
    assert.match(source, /firebase-production-deploy\.yml/i, `${name} must name the protected production workflow`);
    assert.match(source, /exact current `main` SHA|exact current main SHA|exact current main/i, `${name} must require exact-main binding`);
  }

  assert.doesNotMatch(deploymentChecklist, /^#.*HOME OS/im);
  assert.match(deploymentChecklist, /Hard public launch remains `NO-GO`/i);
  assert.match(deployGuide, /adminCreateUser/i);
  assert.match(adminGuide, /adminCreateUser/i);
});

test('focused launch audit cannot silently drop protected Admin and deployment documentation guards', () => {
  const occurrences = focusedWorkflow.split(guardPath).length - 1;
  assert.equal(
    occurrences,
    2,
    'focused audit must include the protected Admin/deployment guard in path filters and the node --test command',
  );

  for (const path of [
    'DEPLOY.md',
    'docs/DEPLOYMENT.md',
    'ADMIN_COMMAND_CENTER.md',
    'scripts/grant-admin.mjs',
    'scripts/verify-admin-access.mjs',
  ]) {
    assert.match(focusedWorkflow, new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
