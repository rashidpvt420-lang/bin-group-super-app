#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createRulesReleaseRecovery } from './lib/firebase-rules-release-recovery.mjs';

const PROJECT_ID = 'bin-group-57c60';
export const NONFUNCTIONS_TARGET = 'hosting,firestore:rules,firestore:indexes,storage';
const EXPECTED_ARGS = Object.freeze([
  'deploy', '--only', NONFUNCTIONS_TARGET, '--project', PROJECT_ID, '--non-interactive', '--force',
]);

export function assertNonfunctionsProductionInvocation({ env, args, approval }) {
  const sha = env.GITHUB_SHA;
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_WORKFLOW !== 'Firebase Production Deploy' ||
    env.GITHUB_JOB !== 'deploy-firebase-production-stack' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.DEPLOYMENT_ENVIRONMENT !== 'production' ||
    env.GCP_PROJECT_ID !== PROJECT_ID ||
    !/^[0-9a-f]{40}$/.test(sha || '') ||
    env.PRODUCTION_EXACT_MAIN_VERIFIED_SHA !== sha ||
    env.PRODUCTION_FUNCTION_BATCHES_COMPLETED_SHA !== sha ||
    !/^sha256:[a-f0-9]{64}$/.test(env.VALIDATED_ARTIFACT_DIGEST || '') ||
    approval?.commitSha !== sha ||
    approval?.artifactDigest !== env.VALIDATED_ARTIFACT_DIGEST ||
    approval?.githubEnvironment !== 'production' ||
    approval?.approvedVia !== 'github-environment-protection'
  ) {
    throw new Error('[rules-release] Protected exact-SHA production approval and completed Functions batches required');
  }
  if (!Array.isArray(args) || args.length !== EXPECTED_ARGS.length ||
      args.some((arg, index) => arg !== EXPECTED_ARGS[index])) {
    throw new Error('[rules-release] Only the fixed non-Functions production deployment is allowed');
  }
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  try {
    let approval;
    try {
      approval = JSON.parse(readFileSync('launch_package/predeploy-approval.json', 'utf8'));
    } catch {
      throw new Error('[rules-release] Protected predeploy approval is missing or malformed');
    }
    assertNonfunctionsProductionInvocation({ env: process.env, args: process.argv.slice(2), approval });

    // Functions deployment can take hours. Recheck current main before releasing
    // rules/Hosting, not just the SHA verified before the first Functions batch.
    const remote = spawnSync('git', ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'], {
      encoding: 'utf8', shell: false, timeout: 30_000,
    });
    const remoteSha = String(remote.stdout || '').trim().split(/\s+/)[0];
    if (remote.status !== 0 || remoteSha !== process.env.GITHUB_SHA) {
      throw new Error('[rules-release] Current origin/main no longer matches this deployment; refusing release');
    }

    // A process-local adapter, not a node_modules edit. No Firebase code is loaded
    // before the production checks above. Compilation/upload/release order stays
    // owned by the installed CLI and errors still fail its deploy command.
    const require = createRequire(import.meta.url);
    const rules = require('firebase-tools/lib/gcp/rules.js');
    if (typeof rules.updateOrCreateRelease !== 'function' ||
        typeof rules.updateRelease !== 'function' || typeof rules.createRelease !== 'function') {
      throw new Error('[rules-release] Unsupported Firebase CLI release adapter; refusing deployment');
    }
    rules.updateOrCreateRelease = createRulesReleaseRecovery({
      updateRelease: rules.updateRelease.bind(rules),
      createRelease: rules.createRelease.bind(rules),
    });
    require('firebase-tools/lib/bin/firebase.js');
  } catch (error) {
    console.error(error instanceof Error ? error.message : '[rules-release] Production Rules deployment failed');
    process.exitCode = 1;
  }
}
