#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
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
  console.log(`\n[public-release] $ ${command} ${args.join(' ')}`);
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

function validateContext() {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions is required');
  if (required('GITHUB_REPOSITORY') !== expectedRepository) throw new Error('Unexpected GitHub repository');
  if (required('GITHUB_REF') !== 'refs/heads/main') throw new Error('Public release requires refs/heads/main');
  const sha = required('GITHUB_SHA');
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error('GITHUB_SHA must be a lowercase full SHA');
  if (required('EXPECTED_COMMIT_SHA') !== sha) throw new Error('EXPECTED_COMMIT_SHA does not match GITHUB_SHA');
  if (required('LAUNCH_MODE') !== 'public') throw new Error('Public release runner requires LAUNCH_MODE=public');
  if (required('HARD_LAUNCH_CONFIRMATION') !== 'AUTHORIZE_HARD_PUBLIC_LAUNCH_BIN_GROUP') {
    throw new Error('Hard-launch confirmation mismatch');
  }
  return sha;
}

function readJson(relativePath) {
  const file = path.join(root, relativePath);
  if (!existsSync(file)) throw new Error(`${relativePath} is missing`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

function verifyDownloadedArtifacts(sha) {
  const deployment = readJson('launch_package/production-deployment.json');
  const incidents = readJson('launch_package/production-incidents.json');
  const approval = readJson('launch_package/predeploy-approval.json');
  const runId = String(process.env.GITHUB_RUN_ID || '');
  if (deployment.source !== 'firebase-production-deploy-workflow') throw new Error('Deployment source mismatch');
  if (deployment.deployedCommitSha !== sha) throw new Error('Deployment SHA mismatch');
  if (String(deployment.workflowRunId || '') !== runId) throw new Error('Deployment workflow run mismatch');
  if (incidents.commitSha !== sha) throw new Error('Incident SHA mismatch');
  if (String(incidents.workflowRunId || '') !== runId) throw new Error('Incident workflow run mismatch');
  if (approval.commitSha !== sha) throw new Error('Predeploy approval SHA mismatch');
  if (deployment.hardLaunchClaim === true) throw new Error('Downloaded deployment must not already claim hard launch');
  const digest = String(deployment.artifactDigest || deployment.validatedArtifactDigest || '').trim();
  if (!/^sha256:[0-9a-f]{64}$/i.test(digest)) throw new Error('Deployment artifact digest is missing or invalid');
  return digest.toLowerCase();
}

try {
  const sha = validateContext();
  const digest = verifyDownloadedArtifacts(sha);

  runNpm('test:e2e:env');
  runNpm('seed:e2e:auth');
  runNpm('seed:e2e:live-data');
  runNpm('seed:e2e:gate11');
  runNpm('test:e2e:gate11:routes');
  runNpm('test:gate12:smtp');
  runNpm('test:gate12:appcheck');
  run(process.execPath, ['scripts/record-postdeploy-aggregate-evidence.mjs', '--only', 'gate11']);
  runNpm('test:e2e:business');
  run(process.execPath, ['scripts/record-postdeploy-aggregate-evidence.mjs', '--only', 'business']);
  runNpm('test:e2e:launch-audit:live');

  runNpm('launch:pilot-incident');
  runNpm('launch:pilot-evidence');

  run(process.execPath, ['scripts/postdeploy-release-gate.mjs'], {
    DEPLOYMENT_ENVIRONMENT: 'production',
    RELEASE_ID: `${required('GITHUB_RUN_ID')}-${String(process.env.GITHUB_RUN_ATTEMPT || '1')}`,
    VALIDATED_ARTIFACT_DIGEST: digest,
    POSTDEPLOY_ROUTES_OK: 'true',
    POSTDEPLOY_SMTP_OK: 'true',
    POSTDEPLOY_APPCHECK_OK: 'true',
    POSTDEPLOY_SMOKE_OK: 'true',
    POSTDEPLOY_BUSINESS_OK: 'true',
    POSTDEPLOY_AUDIT_OK: 'true',
  });

  runNpm('hard-launch:decision', {
    POSTDEPLOY_RELEASE_CLEARED: 'true',
  });

  const decision = readJson('launch_package/hard-launch-decision.json');
  if (decision.status !== 'approved' || decision.hardLaunchClaim !== true) {
    throw new Error('Signed hard-launch decision did not approve public release');
  }

  console.log(`\n[public-release] PASS commit=${sha} hardLaunchClaim=true`);
} catch (error) {
  console.error(`\n[public-release] FAIL: ${error.message}`);
  process.exit(1);
}
