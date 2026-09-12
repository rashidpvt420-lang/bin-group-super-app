#!/usr/bin/env node

import { spawnSync, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const PRODUCTION_PROJECT_ID = 'bin-group-57c60';
const SHA_RE = /^[0-9a-f]{40}$/;
const RUN_ID_RE = /^\d+$/;
const DIGEST_RE = /^sha256:[0-9a-f]{64}$/;

const ALLOWED_ENTRYPOINTS = Object.freeze({
  'Operational Application Evidence/verify-and-publish': new Set([
    'scripts/verify-operational-application-provenance.mjs',
    'scripts/verify-operational-application-evidence-mfa.mjs',
    'scripts/bind-operational-application-provenance.mjs',
  ]),
  'Operational Provider Evidence/verify-and-publish': new Set([
    'scripts/verify-smtp-live-delivery.mjs',
    'scripts/verify-appcheck-enforcement.mjs',
    'scripts/verify-ai-live-evidence.mjs',
    'scripts/verify-stripe-live-proof.mjs',
  ]),
  'Technician Physical Evidence/verify-physical-evidence': new Set([
    'scripts/verify-technician-physical-evidence.mjs',
  ]),
  'Privileged Access Rotation Evidence/verify-rotation': new Set([
    'scripts/verify-admin-credential-login.mjs',
    'scripts/verify-privileged-access-rotation.mjs',
    'scripts/bind-admin-credential-rotation-proof.mjs',
  ]),
});

const fail = (message) => {
  throw new Error(`[frozen-release-evidence] ${message}`);
};

export function validateFrozenReleaseEvidenceContext(env, releaseRoot, entrypoint) {
  if (env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions is required');
  if (env.GITHUB_REPOSITORY !== EXPECTED_REPOSITORY) fail('repository mismatch');
  if (env.GITHUB_REF !== 'refs/heads/main') fail('refs/heads/main is required');

  const controlPlaneSha = String(env.CONTROL_PLANE_COMMIT_SHA || '').trim();
  const releaseSha = String(env.PRODUCTION_RELEASE_SHA || '').trim();
  const deployRunId = String(env.PRODUCTION_DEPLOY_RUN_ID || '').trim();
  if (!SHA_RE.test(controlPlaneSha) || env.GITHUB_SHA !== controlPlaneSha) {
    fail('control-plane SHA must equal the protected workflow GITHUB_SHA');
  }
  if (!SHA_RE.test(releaseSha)) fail('frozen production release SHA is invalid');
  if (!RUN_ID_RE.test(deployRunId)) fail('production deploy run ID must be numeric');
  if (env.CONTROL_PLANE_SCOPE_VERIFIED !== 'true') fail('control-plane scope was not verified');

  const context = `${env.GITHUB_WORKFLOW || ''}/${env.GITHUB_JOB || ''}`;
  if (!ALLOWED_ENTRYPOINTS[context]?.has(entrypoint)) fail('entrypoint is not authorized for this protected job');

  const checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: releaseRoot,
    encoding: 'utf8',
  }).trim();
  if (checkedOutSha !== releaseSha) fail('checked-out release does not equal the frozen production release SHA');

  let deployment;
  try {
    deployment = JSON.parse(readFileSync(path.join(releaseRoot, 'launch_package/production-deployment.json'), 'utf8'));
  } catch (error) {
    fail(`production deployment metadata is unavailable: ${error.message}`);
  }
  if (deployment.status !== 'passed' || deployment.projectId !== PRODUCTION_PROJECT_ID) fail('production deployment status/project mismatch');
  if (deployment.deployedCommitSha !== releaseSha) fail('production deployment release SHA mismatch');
  if (String(deployment.workflowRunId || '') !== deployRunId) fail('production deployment run ID mismatch');
  if (deployment.workflowRef !== 'refs/heads/main' || deployment.repository !== EXPECTED_REPOSITORY) fail('production deployment repository/ref mismatch');
  if (!DIGEST_RE.test(String(deployment.validatedArtifactDigest || '').toLowerCase())) fail('production deployment digest is invalid');
  const deployedAt = Date.parse(String(deployment.deployedAt || ''));
  if (!Number.isFinite(deployedAt) || deployedAt > Date.now() + 5 * 60 * 1000) fail('production deployment timestamp is invalid');
  if (Date.now() - deployedAt > 7 * 24 * 60 * 60 * 1000) fail('production deployment is older than seven days');

  return { controlPlaneSha, releaseSha };
}

export function runFrozenReleaseEvidence(entrypoint, env = process.env, releaseRoot = process.cwd()) {
  const { controlPlaneSha, releaseSha } = validateFrozenReleaseEvidenceContext(env, releaseRoot, entrypoint);
  const result = spawnSync(process.execPath, [path.resolve(releaseRoot, entrypoint)], {
    cwd: releaseRoot,
    env: {
      ...env,
      GITHUB_SHA: releaseSha,
      CLEARANCE_CONTROL_PLANE_SHA: controlPlaneSha,
    },
    stdio: 'inherit',
  });
  if (result.error) fail(`could not start ${entrypoint}: ${result.error.message}`);
  if (result.signal) fail(`${entrypoint} terminated by signal ${result.signal}`);
  return Number.isInteger(result.status) ? result.status : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entrypoint = String(process.argv[2] || '').trim();
  if (!entrypoint || process.argv.length !== 3) fail('exactly one authorized evidence entrypoint is required');
  process.exitCode = runFrozenReleaseEvidence(entrypoint);
}
