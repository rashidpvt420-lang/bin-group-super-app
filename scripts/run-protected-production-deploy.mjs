#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const expectedRepository = 'rashidpvt420-lang/bin-group-super-app';

function required(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function run(command, args, env = {}) {
  console.log(`\n[protected-deploy] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
    shell: false,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Command failed (${result.status ?? 1}): ${command} ${args.join(' ')}`);
  }
  return result.stdout || '';
}

function runNpm(script, env = {}) {
  return run(npmCommand, ['run', script], env);
}

function validateDispatch() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions is required');
  if (required('GITHUB_REPOSITORY') !== expectedRepository) throw new Error('Unexpected GitHub repository');
  if (required('GITHUB_REF') !== 'refs/heads/main') throw new Error('Production deploy requires refs/heads/main');
  const sha = required('GITHUB_SHA');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('GITHUB_SHA must be a lowercase full SHA');
  if (required('EXPECTED_COMMIT_SHA') !== sha) throw new Error('EXPECTED_COMMIT_SHA does not match GITHUB_SHA');
  if (required('DEPLOYMENT_CONFIRMATION') !== 'DEPLOY_PRODUCTION_BIN_GROUP_57C60') {
    throw new Error('Deployment confirmation mismatch');
  }
  if (required('HARD_LAUNCH_CONFIRMATION') !== 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP') {
    throw new Error('Hard-launch confirmation mismatch');
  }
  const mode = required('LAUNCH_MODE');
  if (!['bank-pilot', 'public'].includes(mode)) throw new Error('LAUNCH_MODE must be bank-pilot or public');
  return { sha, mode };
}

function writePredeployApproval({ sha, mode, digest }) {
  const approvedBy = required('PRODUCTION_APPROVED_BY').toLowerCase();
  const authorized = required('AUTHORIZED_FOUNDER_EMAILS')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (!authorized.includes(approvedBy)) {
    throw new Error('PRODUCTION_APPROVED_BY is not listed in AUTHORIZED_FOUNDER_EMAILS');
  }
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  const doc = {
    schemaVersion: 1,
    commitSha: sha,
    artifactDigest: digest,
    releaseId: `${required('GITHUB_RUN_ID')}-${String(process.env.GITHUB_RUN_ATTEMPT || '1')}`,
    approvedAt: new Date().toISOString(),
    approvedBy,
    approvedVia: 'github-environment-protection',
    githubEnvironment: 'production',
    launchMode: mode,
  };
  writeFileSync(path.join(root, 'launch_package/predeploy-approval.json'), `${JSON.stringify(doc, null, 2)}\n`, {
    mode: 0o600,
  });
}

function verifyDeployment(sha) {
  const deploymentPath = path.join(root, 'launch_package/production-deployment.json');
  if (!existsSync(deploymentPath)) throw new Error('production-deployment.json was not produced');
  const doc = JSON.parse(readFileSync(deploymentPath, 'utf8'));
  if (doc.source !== 'firebase-production-deploy-workflow') throw new Error('Deployment source mismatch');
  if (doc.deployedCommitSha !== sha) throw new Error('Deployment SHA mismatch');
  if (String(doc.workflowRunId || '') !== String(process.env.GITHUB_RUN_ID || '')) {
    throw new Error('Deployment workflow run mismatch');
  }
  if (doc.hardLaunchClaim === true) throw new Error('Deploy stage must not claim hard public launch');
}

try {
  const { sha, mode } = validateDispatch();

  run(process.execPath, ['scripts/create-production-incidents-attestation.mjs']);
  runNpm('hard-launch:authorize');
  runNpm('hard-launch:predeploy');
  run(process.execPath, ['scripts/write-production-env.mjs']);

  runNpm('build:shared');
  runNpm('build');
  runNpm('build:admin', { CI: 'false' });
  runNpm('verify:admin-firebase', { CI: 'false' });
  runNpm('build:functions');
  runNpm('measure:functions-load');
  runNpm('test:rules');

  const digestOutput = run(process.execPath, ['scripts/compute-artifact-digest.mjs']);
  const digest = digestOutput.match(/sha256:[0-9a-f]{64}/i)?.[0]?.toLowerCase();
  if (!digest) throw new Error('Validated artifact digest was not produced');
  process.env.VALIDATED_ARTIFACT_DIGEST = digest;
  writePredeployApproval({ sha, mode, digest });

  run(process.execPath, ['scripts/predeploy-approval-gate.mjs'], {
    DEPLOYMENT_ENVIRONMENT: 'production',
    LAUNCH_BANK_ONLY: mode === 'bank-pilot' ? '1' : '0',
    PREDEPLOY_BUILD_OK: 'true',
    PREDEPLOY_ADMIN_BUILD_OK: 'true',
    PREDEPLOY_FUNCTIONS_BUILD_OK: 'true',
    PREDEPLOY_RULES_OK: 'true',
    PREDEPLOY_FUNCTIONS_LOAD_OK: 'true',
  });

  run(process.execPath, ['scripts/deploy-firebase-production.mjs'], {
    VALIDATED_ARTIFACT_DIGEST: digest,
  });
  verifyDeployment(sha);

  runNpm('test:e2e:env');
  runNpm('seed:e2e:auth');
  runNpm('seed:e2e:live-data');
  run(process.execPath, ['scripts/run-critical-evidence.mjs', '--suite', 'productionDeployment']);
  runNpm('test:e2e:business');
  runNpm('test:e2e:launch-audit:live');
  runNpm('launch:status');

  runNpm('hard-launch:decision', {
    POSTDEPLOY_RELEASE_CLEARED: 'false',
  });

  console.log(`\n[protected-deploy] PASS mode=${mode} commit=${sha} hardLaunchClaim=false`);
} catch (error) {
  console.error(`\n[protected-deploy] FAIL: ${error.message}`);
  process.exit(1);
}
