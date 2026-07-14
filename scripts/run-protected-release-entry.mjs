#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, env = {}) {
  console.log(`\n[release-entry] $ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
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
}

function npm(script, env = {}) {
  run(npmCommand, ['run', script], env);
}

try {
  if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('GitHub Actions is required');
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('refs/heads/main is required');
  if (process.env.EXPECTED_COMMIT_SHA !== process.env.GITHUB_SHA) {
    throw new Error('Expected commit does not match the checked-out commit');
  }

  run(process.execPath, ['scripts/normalize-firestore-rules.mjs']);
  run(process.execPath, ['scripts/repo-hygiene-guard.mjs']);
  run(process.execPath, ['scripts/write-production-env.mjs']);
  npm('test:stability');
  npm('test:launch-honesty');
  npm('typecheck');
  npm('lint');
  npm('test:mobile-store-readiness');

  run(process.execPath, ['scripts/run-protected-production-deploy.mjs']);

  if (String(process.env.RUN_PUBLIC_RELEASE_GATE || '') === 'true') {
    if (process.env.LAUNCH_MODE !== 'public') {
      throw new Error('Public release gate requires LAUNCH_MODE=public');
    }
    run(process.execPath, ['scripts/run-protected-public-release.mjs']);
  }

  console.log(`\n[release-entry] PASS mode=${process.env.LAUNCH_MODE} publicGate=${process.env.RUN_PUBLIC_RELEASE_GATE}`);
} catch (error) {
  console.error(`\n[release-entry] FAIL: ${error.message}`);
  process.exit(1);
}
