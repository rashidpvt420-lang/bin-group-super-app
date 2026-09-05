import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  assertNonfunctionsProductionInvocation,
  NONFUNCTIONS_TARGET,
} from '../../scripts/firebase-nonfunctions-production-cli.mjs';

const SHA = 'a'.repeat(40);
const DIGEST = `sha256:${'b'.repeat(64)}`;
const environment = {
  GITHUB_ACTIONS: 'true',
  GITHUB_WORKFLOW: 'Firebase Production Deploy',
  GITHUB_JOB: 'deploy-firebase-production-stack',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: SHA,
  DEPLOYMENT_ENVIRONMENT: 'production',
  GCP_PROJECT_ID: 'bin-group-57c60',
  PRODUCTION_EXACT_MAIN_VERIFIED_SHA: SHA,
  PRODUCTION_FUNCTION_BATCHES_COMPLETED_SHA: SHA,
  VALIDATED_ARTIFACT_DIGEST: DIGEST,
};
const approval = {
  commitSha: SHA,
  artifactDigest: DIGEST,
  githubEnvironment: 'production',
  approvedVia: 'github-environment-protection',
};
const args = ['deploy', '--only', NONFUNCTIONS_TARGET, '--project', 'bin-group-57c60', '--non-interactive', '--force'];

test('wrapper accepts only the approved exact-SHA production context after Functions complete', () => {
  assert.doesNotThrow(() => assertNonfunctionsProductionInvocation({ env: environment, args, approval }));
  for (const key of Object.keys(environment)) {
    assert.throws(() => assertNonfunctionsProductionInvocation({
      env: { ...environment, [key]: '' }, args, approval,
    }), /Protected exact-SHA/, key);
  }
  for (const key of Object.keys(approval)) {
    assert.throws(() => assertNonfunctionsProductionInvocation({
      env: environment, args, approval: { ...approval, [key]: '' },
    }), /Protected exact-SHA/, key);
  }
  assert.throws(() => assertNonfunctionsProductionInvocation({ env: environment, args }), /Protected exact-SHA/);
  assert.throws(() => assertNonfunctionsProductionInvocation({
    env: { ...environment, PRODUCTION_FUNCTION_BATCHES_COMPLETED_SHA: 'c'.repeat(40) }, args, approval,
  }), /Protected exact-SHA/);
});

test('wrapper rejects alternate commands, targets, projects and extra CLI options', () => {
  for (const invalidArgs of [
    [], ['deploy'], [...args, '--debug'], ['functions:delete'],
    args.map((arg) => arg === NONFUNCTIONS_TARGET ? 'functions' : arg),
    args.map((arg) => arg === 'bin-group-57c60' ? 'another-project' : arg),
  ]) {
    assert.throws(() => assertNonfunctionsProductionInvocation({
      env: environment, args: invalidArgs, approval,
    }), /Only the fixed non-Functions/);
  }
});

test('local invocation fails closed without loading the Firebase deploy CLI', () => {
  const result = spawnSync(process.execPath, ['scripts/firebase-nonfunctions-production-cli.mjs', ...args], {
    env: { ...process.env, GITHUB_ACTIONS: 'false' }, encoding: 'utf8', timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Protected/);
  assert.doesNotMatch(result.stdout, /Deploying to/);
});

test('production orchestrator keeps quota batching before Rules and hosted verification after release', () => {
  const source = readFileSync('scripts/deploy-firebase-production.mjs', 'utf8');
  const wrapper = readFileSync('scripts/firebase-nonfunctions-production-cli.mjs', 'utf8');
  const batches = source.indexOf('const functionDeploymentEvidence = deployFunctionsQuotaSafe();');
  const marker = source.indexOf('process.env.PRODUCTION_FUNCTION_BATCHES_COMPLETED_SHA = githubSha;');
  const nonfunctions = source.indexOf("'non-Functions Firebase production stack'");
  const metadata = source.indexOf("'scripts/write-production-deployment-metadata.mjs'");
  const verification = source.indexOf("'scripts/verify-production-deployment.mjs'");
  assert.ok(batches >= 0 && marker > batches && nonfunctions > marker);
  assert.ok(metadata > nonfunctions && verification > metadata);
  assert.match(source, /useRulesRecovery \? process\.execPath : 'npx'/);
  assert.match(wrapper, /remote\.status !== 0 \|\| remoteSha !== process\.env\.GITHUB_SHA/);
  assert.ok(wrapper.indexOf('assertNonfunctionsProductionInvocation({ env: process.env') <
    wrapper.indexOf("require('firebase-tools/lib/gcp/rules.js')"));
  assert.ok(wrapper.indexOf('remoteSha !== process.env.GITHUB_SHA') <
    wrapper.indexOf("require('firebase-tools/lib/gcp/rules.js')"));
});
