#!/usr/bin/env node
/**
 * Pilot launch watch — never starts/continues pilot while smoke, launch audit,
 * or business workflows are failing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const outDir = path.join(process.cwd(), 'launch_package');
const lockPath = path.join(outDir, 'pilot-start.lock.json');
const statusPath = path.join(outDir, 'launch-status.json');
const evidencePath = path.join(outDir, 'launch-evidence-batch.json');

function gitSha() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  return (result.stdout || '').trim() || 'unknown';
}

function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', env: process.env });
  return result.status ?? 1;
}

const mode = process.argv.includes('--invalidate')
  ? 'invalidate'
  : process.argv.includes('--start')
    ? 'start'
    : 'watch';

mkdirSync(outDir, { recursive: true });

if (mode === 'invalidate') {
  if (existsSync(lockPath)) {
    const lock = readJson(lockPath, {});
    writeFileSync(
      lockPath,
      JSON.stringify({ ...lock, status: 'invalidated', invalidatedAt: new Date().toISOString(), reason: 'manual invalidate' }, null, 2) + '\n',
    );
    console.log('[pilot-watch] pilot start invalidated');
  } else {
    console.log('[pilot-watch] no pilot lock to invalidate');
  }
  process.exit(0);
}

console.log('[pilot-watch] refreshing launch status...');
const statusCode = run(process.execPath, ['scripts/launch-status.mjs']);
const status = readJson(statusPath, {});
const evidence = readJson(evidencePath, { records: [] });
const sha = gitSha();
const adminOk = (evidence.records || []).some(
  (r) => r.testName === 'adminCredentialLogin' && r.exitCode === 0 && r.commitSha === sha,
);

if (statusCode !== 0 || !status.automationOk) {
  if (existsSync(lockPath)) {
    const lock = readJson(lockPath, {});
    writeFileSync(
      lockPath,
      JSON.stringify({
        ...lock,
        status: 'invalidated',
        invalidatedAt: new Date().toISOString(),
        reason: 'smoke/launch-status/business automation failing',
        commitSha: sha,
      }, null, 2) + '\n',
    );
  }
  console.error('[pilot-watch] FAIL — required automation failing; pilot not eligible');
  process.exit(1);
}

if (!adminOk) {
  if (existsSync(lockPath)) {
    const lock = readJson(lockPath, {});
    writeFileSync(
      lockPath,
      JSON.stringify({
        ...lock,
        status: 'invalidated',
        invalidatedAt: new Date().toISOString(),
        reason: 'adminCredentialLogin evidence missing for current commit',
        commitSha: sha,
      }, null, 2) + '\n',
    );
  }
  console.error('[pilot-watch] FAIL — adminCredentialLogin not recorded from authenticated admin smoke');
  process.exit(1);
}

if (mode === 'start') {
  writeFileSync(
    lockPath,
    JSON.stringify({
      status: 'started',
      startedAt: new Date().toISOString(),
      commitSha: sha,
      note: 'Controlled pilot only — hard launch not claimed',
      hardLaunchClaim: false,
    }, null, 2) + '\n',
  );
  console.log('[pilot-watch] controlled pilot start recorded (hardLaunchClaim=false)');
  process.exit(0);
}

const lock = readJson(lockPath, null);
if (lock?.status === 'started' && lock.commitSha === sha) {
  console.log('[pilot-watch] PASS — existing controlled pilot remains eligible for this commit');
  process.exit(0);
}

console.log('[pilot-watch] PASS — eligible, but pilot not started (pass --start to record controlled pilot)');
process.exit(0);
