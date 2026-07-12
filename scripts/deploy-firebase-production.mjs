#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const projectId = String(process.env.GCP_PROJECT_ID || '').trim();
if (!projectId) {
  console.error('[production-deploy] GCP_PROJECT_ID is required');
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

retryFirebase('hosting,firestore:rules,firestore:indexes,storage', 'critical Firebase resources');
retryFirebase('functions', 'Firebase Functions');

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
