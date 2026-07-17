#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { requireArtifactDigest } from './lib/launch-gate-common.mjs';
import { verifyFirebaseProductionSecrets } from './verify-firebase-production-secrets.mjs';
import { verifyFirebasePhoneAuthProduction } from './verify-firebase-phone-auth-production.mjs';

const expectedProjectId = 'bin-group-57c60';
const deploymentEnvironment = String(process.env.DEPLOYMENT_ENVIRONMENT || '').trim();
const githubSha = String(process.env.GITHUB_SHA || '').trim();
const launchMode = String(process.env.LAUNCH_MODE || '').trim();
const artifactDigest = String(process.env.VALIDATED_ARTIFACT_DIGEST || '').trim();
const approvalPath = 'launch_package/predeploy-approval.json';
const digestFailures = [];
const validatedArtifactDigest = requireArtifactDigest(
  artifactDigest,
  'VALIDATED_ARTIFACT_DIGEST',
  digestFailures,
);

if (
  process.env.GITHUB_ACTIONS !== 'true' ||
  process.env.GITHUB_REF !== 'refs/heads/main' ||
  deploymentEnvironment !== 'production' ||
  !/^[0-9a-f]{40}$/.test(githubSha) ||
  !validatedArtifactDigest
) {
  console.error('[production-deploy] Refusing deployment outside the protected exact-SHA production workflow');
  for (const failure of digestFailures) console.error(`[production-deploy] ${failure}`);
  process.exit(1);
}

if (!existsSync(approvalPath)) {
  console.error(`[production-deploy] Missing protected predeploy approval: ${approvalPath}`);
  process.exit(1);
}

let approval;
try {
  approval = JSON.parse(readFileSync(approvalPath, 'utf8'));
} catch {
  console.error('[production-deploy] Protected predeploy approval is malformed');
  process.exit(1);
}

if (
  approval.commitSha !== githubSha ||
  approval.artifactDigest !== artifactDigest ||
  approval.githubEnvironment !== 'production' ||
  approval.approvedVia !== 'github-environment-protection'
) {
  console.error('[production-deploy] Protected predeploy approval does not match this SHA and artifact');
  process.exit(1);
}

const projectId = String(process.env.GCP_PROJECT_ID || '').trim();
if (projectId !== expectedProjectId) {
  console.error(`[production-deploy] GCP_PROJECT_ID must equal ${expectedProjectId}`);
  process.exit(1);
}

const remoteMain = spawnSync(
  'git',
  ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'],
  { cwd: process.cwd(), encoding: 'utf8', shell: false },
);
const remoteMainSha = String(remoteMain.stdout || '').trim().split(/\s+/)[0] || '';
if ((remoteMain.status ?? 1) !== 0 || remoteMainSha !== githubSha) {
  console.error(
    `[production-deploy] Refusing stale deployment: current origin/main ${remoteMainSha || '(unavailable)'} does not match GITHUB_SHA`,
  );
  process.exit(1);
}

try {
  await verifyFirebaseProductionSecrets({ projectId, launchMode });
} catch (error) {
  const message = error instanceof Error ? error.message : 'secret metadata verification failed';
  console.error(`[production-deploy] Required Firebase production function secret preflight failed: ${message}`);
  process.exit(1);
}

try {
  await verifyFirebasePhoneAuthProduction({ projectId });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Phone Auth configuration verification failed';
  console.error(`[production-deploy] Firebase Phone Auth production preflight failed: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  return result.status ?? 1;
}

function retryFirebase(target, label) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    console.log(`[production-deploy] ${label} attempt ${attempt}/3`);
    const status = run('npx', [
      'firebase',
      'deploy',
      '--only',
      target,
      '--project',
      projectId,
      '--non-interactive',
      '--force',
    ]);
    if (status === 0) return;
    if (attempt < 3) {
      const sleep = spawnSync('sleep', ['30'], { stdio: 'inherit' });
      if ((sleep.status ?? 1) !== 0) process.exit(1);
    }
  }
  console.error(`[production-deploy] ${label} failed after 3 attempts`);
  process.exit(1);
}

retryFirebase(
  'functions,hosting,firestore:rules,firestore:indexes,storage',
  'complete Firebase production stack',
);

const metadataStatus = run(process.execPath, [
  'scripts/write-production-deployment-metadata.mjs',
  '--components',
  'hosting,firestoreRules,firestoreIndexes,storageRules,functions',
]);
if (metadataStatus !== 0) process.exit(metadataStatus);

const verifyStatus = run(process.execPath, [
  'scripts/verify-production-deployment.mjs',
  '--write-evidence',
]);
if (verifyStatus !== 0) process.exit(verifyStatus);

console.log('[production-deploy] production deployment and identity verification passed');
