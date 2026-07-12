#!/usr/bin/env node
/**
 * Production hosting deploy helper for local E2E runs.
 * Builds main + admin with App Check baked in, deploys hosting only, verifies bundles.
 */
import { spawnSync } from 'node:child_process';

function run(cmd, args, label) {
  console.log(`\n[launch-deploy-hosting] ${label}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
  if ((result.status ?? 1) !== 0) {
    console.error(`[launch-deploy-hosting] FAIL ${label}`);
    process.exit(result.status ?? 1);
  }
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const project = process.env.FIREBASE_PROJECT || 'bin-group-57c60';

run(npm, ['run', 'build:live'], 'build:live (App Check enabled)');
run('npx', ['firebase', 'deploy', '--only', 'hosting', '--project', project, '--non-interactive'], 'firebase deploy hosting');
run(process.execPath, ['scripts/verify-hosted-appcheck.mjs'], 'verify hosted App Check bundles');

console.log('\n[launch-deploy-hosting] ok — hosting deployed with App Check; run profile-gates next.');
