import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const deploy = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');

test('production Firebase deploy stays non-cancellable but exits cooperatively when protected main moves', () => {
  assert.match(workflow, /cancel-in-progress:\s*false/);
  assert.match(deploy, /function assertRemoteMainStillExpected\(stage\)/);
  assert.match(deploy, /git['"],\s*\n\s*\['ls-remote', '--exit-code', 'origin', 'refs\/heads\/main'\]/);
  assert.match(deploy, /remoteMainSha !== githubSha/);
  assert.match(deploy, /assertDeploymentContinuable\('before secret preflight'\)/);
  assert.match(deploy, /assertDeploymentContinuable\(`\$\{label\} before attempt \$\{attempt\}`\)/);
  assert.match(deploy, /assertDeploymentContinuable\(`\$\{label\} after attempt \$\{attempt\}`\)/);
  assert.match(deploy, /assertDeploymentContinuable\('before writing production deployment metadata'\)/);
  assert.match(deploy, /assertDeploymentContinuable\('before final production verification'\)/);
  assert.match(deploy, /assertDeploymentContinuable\('after final production verification'\)/);
});

test('production Firebase deploy step has a hard total budget and each Firebase command is capped by what remains', () => {
  assert.match(deploy, /FIREBASE_DEPLOY_TOTAL_BUDGET_SECONDS/);
  assert.match(deploy, /7200,\s*\n\s*1800,\s*\n\s*10800/);
  assert.match(deploy, /deploymentDeadlineMs = deploymentStartedAtMs \+ deploymentBudgetSeconds \* 1000/);
  assert.match(deploy, /function remainingDeploymentBudgetMs\(stage\)/);
  assert.match(deploy, /total Firebase deployment budget/);
  assert.match(deploy, /effectiveCommandTimeoutMs = Math\.min\(commandTimeoutSeconds \* 1000, remainingBudgetMs\)/);
  assert.match(deploy, /timeout: effectiveCommandTimeoutMs/);
  assert.match(deploy, /killSignal: 'SIGTERM'/);
});

test('retry and quota cooldown paths cannot silently run past the deployment budget', () => {
  assert.match(deploy, /before retry cooldown/);
  assert.match(deploy, /total deployment budget cannot cover the cooldown plus a safe retry window/);
  assert.match(deploy, /before quota cooldown/);
  assert.match(deploy, /total deployment budget cannot cover the quota cooldown safely/);
});

test('stale Admin bootstrap cannot write deployment metadata after protected main supersession', () => {
  const guard = deploy.indexOf("assertDeploymentContinuable('before Admin MFA bootstrap metadata')");
  const write = deploy.indexOf('writeFileSync(adminBootstrapMetadataPath');
  assert.ok(guard >= 0 && write > guard, 'Admin bootstrap metadata must be guarded by a fresh exact-main check');
});
