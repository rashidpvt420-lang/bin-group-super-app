#!/usr/bin/env node
/**
 * Orchestrates launch repair checks without claiming hard launch.
 * Never starts pilot when smoke / launch audit / business workflows fail.
 * Critical evidence is execution-generated only.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'launch_package');
const reportPath = path.join(outDir, 'launch-fix-all-report.json');
const skipE2E = process.argv.includes('--skip-e2e');
const skipBusiness = process.argv.includes('--skip-business');

function run(label, cmd, args, env = {}) {
  console.log(`\n[launch-fix-all] ▶ ${label}`);
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  const exitCode = result.status ?? 1;
  console.log(`[launch-fix-all] ${exitCode === 0 ? 'PASS' : 'FAIL'} ${label} (exit=${exitCode})`);
  return { label, exitCode, ok: exitCode === 0 };
}

const steps = [];
steps.push(run('build:functions', 'npm', ['run', 'build:functions']));
steps.push(run('measure-functions-load', 'node', ['scripts/measure-functions-load.mjs']));
steps.push(run('test:launch-honesty', 'npm', ['run', 'test:launch-honesty']));
steps.push(run('ensure-appcheck', 'node', ['scripts/ensure-appcheck.mjs']));
steps.push(run('verify-e2e-env', 'node', ['scripts/verify-e2e-env.mjs']));
steps.push(run('verify-admin-firebase', 'node', ['scripts/verify-admin-firebase-build.mjs']));
steps.push(run('verify-production-deployment', 'node', ['scripts/verify-production-deployment.mjs']));

if (!skipE2E) {
  steps.push(run('e2e:launch-audit:live', 'npm', ['run', 'test:e2e:launch-audit:live']));
}
if (!skipBusiness) {
  steps.push(run('e2e:business', 'npm', ['run', 'test:e2e:business']));
}

steps.push(run('launch-status', 'node', ['scripts/launch-status.mjs']));

const failed = steps.filter((s) => !s.ok);
mkdirSync(outDir, { recursive: true });

const report = {
  generatedAt: new Date().toISOString(),
  hardLaunchClaim: false,
  pilotStarted: false,
  steps,
  failed: failed.map((f) => f.label),
};

if (failed.length) {
  const lockPath = path.join(outDir, 'pilot-start.lock.json');
  if (existsSync(lockPath)) {
    try {
      const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
      writeFileSync(
        lockPath,
        `${JSON.stringify({
          ...lock,
          status: 'invalidated',
          invalidatedAt: new Date().toISOString(),
          reason: `launch-fix-all failed: ${failed.map((f) => f.label).join(', ')}`,
          hardLaunchClaim: false,
        }, null, 2)}\n`,
      );
      report.pilotInvalidated = true;
    } catch {
      // ignore
    }
  }
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error('\n[launch-fix-all] FAIL — not starting pilot; hardLaunchClaim=false');
  process.exit(1);
}

writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log('\n[launch-fix-all] PASS repair checks (hardLaunchClaim=false; pilot not auto-started)');
process.exit(0);
