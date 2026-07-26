#!/usr/bin/env node

import { readFileSync, appendFileSync } from 'node:fs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const DEPLOYMENT_PATH = 'launch_package/production-deployment.json';
const text = (value) => String(value ?? '').trim();
const fail = (message) => {
  console.error(`[verify-exact-production-deployment-artifact] FAIL — ${message}`);
  process.exit(1);
};

if (process.env.GITHUB_ACTIONS !== 'true') fail('verification may only run in GitHub Actions');
if (process.env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) fail('repository mismatch');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('verification requires refs/heads/main');

const expectedSha = text(process.env.EXPECTED_DEPLOYMENT_SHA || process.env.GITHUB_SHA);
const expectedRunId = text(process.env.PRODUCTION_DEPLOY_RUN_ID);
if (!/^[0-9a-f]{40}$/.test(expectedSha)) fail('EXPECTED_DEPLOYMENT_SHA must be a lowercase 40-character SHA');
if (!/^\d+$/.test(expectedRunId)) fail('PRODUCTION_DEPLOY_RUN_ID must be numeric');
if (expectedSha !== text(process.env.GITHUB_SHA)) fail('expected deployment SHA does not equal the checked-out main SHA');

let deployment;
try {
  deployment = JSON.parse(readFileSync(DEPLOYMENT_PATH, 'utf8'));
} catch (error) {
  fail(`deployment metadata is missing or malformed: ${error instanceof Error ? error.message : 'unknown error'}`);
}

const failures = [];
if (deployment.status !== 'passed') failures.push('deployment status is not passed');
if (deployment.projectId !== EXPECTED_PROJECT_ID) failures.push('deployment project mismatch');
if (text(deployment.deployedCommitSha) !== expectedSha) failures.push('deployed commit mismatch');
if (text(deployment.workflowRunId) !== expectedRunId) failures.push('deployment workflow run mismatch');
if (deployment.workflowRef !== 'refs/heads/main') failures.push('deployment ref mismatch');
if (deployment.repository !== EXPECTED_REPOSITORY) failures.push('deployment repository mismatch');
const digest = text(deployment.validatedArtifactDigest).toLowerCase();
if (!/^sha256:[a-f0-9]{64}$/.test(digest)) failures.push('validated artifact digest is invalid');
const deployedAt = Date.parse(text(deployment.deployedAt));
if (!Number.isFinite(deployedAt)) failures.push('deployment timestamp is invalid');
const reconciliation = deployment.functionsDeployment?.reconciliation;
if (!reconciliation || reconciliation.status !== 'passed') failures.push('Function reconciliation evidence is missing');
if (Array.isArray(reconciliation?.currentMissingAfter) && reconciliation.currentMissingAfter.length !== 0) {
  failures.push('current Firebase Functions are missing after reconciliation');
}
if (Array.isArray(reconciliation?.obsoleteOwnedRemaining) && reconciliation.obsoleteOwnedRemaining.length !== 0) {
  failures.push('obsolete repository-owned Firebase Functions remain deployed');
}

if (failures.length) {
  for (const failure of failures) console.error(`- ${failure}`);
  fail('exact production deployment verification failed');
}

if (text(process.env.GITHUB_ENV)) {
  appendFileSync(process.env.GITHUB_ENV, `VALIDATED_ARTIFACT_DIGEST=${digest}\n`);
}

console.log(
  `[verify-exact-production-deployment-artifact] PASS sha=${expectedSha} run=${expectedRunId} deployedAt=${new Date(deployedAt).toISOString()}`,
);
